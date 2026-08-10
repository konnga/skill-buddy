import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import type { AgentId } from '../../types.js'
import {
  jsonMcpConfigCodec,
  jsoncMcpConfigCodec,
  tomlMcpConfigCodec,
  type McpConfigCodec,
  type McpConfigObject,
} from '../codecs/index.js'
import {
  defaultMcpHome,
  sourceIdentity,
  type McpPlatformProfile,
} from '../catalog.js'
import {
  hashMcpDefinition,
  hashMcpSource,
  normalizeNativeMcpServer,
  stableMcpId,
} from '../normalize.js'
import type {
  McpConfigSource,
  McpInstallation,
  McpPlatformCapabilities,
} from '../types.js'
import {
  McpOperationError,
  nativeKnownKeys,
  projectMcpDefinition,
  type McpPreparedMutation,
  type McpProjection,
  type McpTarget,
} from '../operations.js'
import type { McpAdapter } from './types.js'

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function codecFor(source: McpConfigSource): McpConfigCodec {
  if (source.format === 'toml') return tomlMcpConfigCodec
  if (source.format === 'jsonc') return jsoncMcpConfigCodec
  return jsonMcpConfigCodec
}

/** 由平台 Profile 驱动的 MCP Adapter，平台差异由 schema 和来源模板收口。 */
export class PlatformMcpAdapter implements McpAdapter {
  readonly profile: McpPlatformProfile
  readonly agent: AgentId
  readonly surface: string
  readonly displayName: string
  readonly capabilities: McpPlatformCapabilities
  readonly #homeDir: string

  constructor(profile: McpPlatformProfile, homeDir: string = defaultMcpHome()) {
    this.profile = profile
    this.agent = profile.agent
    this.surface = profile.surface
    this.displayName = profile.displayName
    this.capabilities = profile.capabilities
    this.#homeDir = resolve(homeDir)
  }

  async detect(projectRoots: string[] = []): Promise<boolean> {
    const sources = await this.configSources(projectRoots)
    if (sources.some((source) => source.exists)) return true
    return (await Promise.all(this.profile.detectPaths(this.#homeDir).map(exists))).some(Boolean)
  }

  async configSources(projectRoots: string[] = []): Promise<McpConfigSource[]> {
    const templates = this.profile.sourceTemplates(this.#homeDir, projectRoots)
    const seen = new Set<string>()
    const sources: McpConfigSource[] = []
    for (const template of templates) {
      const sourceWithoutId: Omit<McpConfigSource, 'id'> = {
        agent: this.agent,
        surface: this.surface,
        scope: template.scope,
        projectRoot: template.projectRoot,
        configPath: resolve(template.path),
        format: template.format,
        nodePath: [...template.nodePath],
        origin: template.origin,
        readOnly: template.readOnly ?? false,
        exists: await exists(template.path),
      }
      const identity = sourceIdentity(sourceWithoutId)
      if (seen.has(identity)) continue
      seen.add(identity)
      sources.push({ ...sourceWithoutId, id: stableMcpId(identity) })
    }
    const fallbackChoices = new Map<string, McpConfigSource>()
    for (let index = 0; index < templates.length; index += 1) {
      const group = templates[index]?.fallbackGroup
      if (!group) continue
      const candidate = sources[index]
      if (!candidate) continue
      const current = fallbackChoices.get(group)
      if (!current || (!current.exists && candidate.exists)) fallbackChoices.set(group, candidate)
    }
    const fallbackIds = new Set([...fallbackChoices.values()].map((source) => source.id))
    return sources.filter((source, index) => {
      const group = templates[index]?.fallbackGroup
      return !group || fallbackIds.has(source.id)
    })
  }

  async read(
    source: McpConfigSource,
    environment: NodeJS.ProcessEnv = process.env,
  ): Promise<McpInstallation[]> {
    if (source.agent !== this.agent || source.surface !== this.surface) {
      throw new Error(`MCP source ${source.id} does not belong to ${this.agent}:${this.surface}`)
    }
    if (!source.exists) return []

    const [text, stat] = await Promise.all([
      fs.readFile(source.configPath, 'utf8'),
      fs.stat(source.configPath),
    ])
    const servers = codecFor(source).readServers(text, source.nodePath)
    const sourceHash = hashMcpSource(text)
    return Object.entries(servers).map(([name, nativeValue]) => {
      if (typeof nativeValue !== 'object' || nativeValue === null || Array.isArray(nativeValue)) {
        throw new Error(`MCP server ${name} in ${source.configPath} must be an object`)
      }
      const normalized = normalizeNativeMcpServer(
        name,
        nativeValue as McpConfigObject,
        this.profile.schema,
        environment,
      )
      return {
        id: stableMcpId(source.id, name),
        definition: normalized.definition,
        source,
        enabled: normalized.enabled,
        authState: normalized.authState,
        definitionHash: hashMcpDefinition(normalized.definition),
        sourceHash,
        modifiedAt: stat.mtimeMs,
        platformMetadata: normalized.platformMetadata,
      }
    })
  }

  project(definition: McpInstallation['definition'], target: McpTarget): McpProjection {
    this.assertTargetOwner(target)
    return projectMcpDefinition(definition, target, this.profile)
  }

  async prepareUpsert(
    definition: McpInstallation['definition'],
    target: McpTarget,
  ): Promise<McpPreparedMutation> {
    const projection = this.project(definition, target)
    if (projection.blockers.length > 0 || !projection.nativeValue) {
      throw new McpOperationError(
        projection.blockers[0]?.code ?? 'MCP_WRITE_FAILED',
        projection.blockers[0]?.message ?? '无法生成 MCP 目标配置',
        projection.blockers,
      )
    }
    const { source, text, servers, beforeHash } = await this.readTarget(target)
    if (source.readOnly) {
      throw new McpOperationError('MCP_TARGET_READ_ONLY', '目标 MCP 配置为只读来源')
    }
    const current = servers[definition.name]
    const known = nativeKnownKeys(this.profile.schema)
    const extensions =
      typeof current === 'object' && current !== null && !Array.isArray(current)
        ? Object.fromEntries(Object.entries(current).filter(([key]) => !known.has(key)))
        : {}
    const nativeValue = { ...extensions, ...projection.nativeValue }
    const afterText = codecFor(source).upsertServer(
      text,
      source.nodePath,
      definition.name,
      nativeValue,
    )
    return {
      kind: 'upsert',
      name: definition.name,
      source,
      beforeHash,
      beforeText: text,
      afterText,
      nativeValue,
      projection,
    }
  }

  async prepareRemove(name: string, target: McpTarget): Promise<McpPreparedMutation> {
    this.assertTargetOwner(target)
    const { source, text, servers, beforeHash } = await this.readTarget(target)
    if (source.readOnly) {
      throw new McpOperationError('MCP_TARGET_READ_ONLY', '目标 MCP 配置为只读来源')
    }
    if (!Object.hasOwn(servers, name)) {
      throw new McpOperationError('MCP_SERVER_NOT_FOUND', `目标中不存在 MCP Server ${name}`)
    }
    return {
      kind: 'remove',
      name,
      source,
      beforeHash,
      beforeText: text,
      afterText: codecFor(source).removeServer(text, source.nodePath, name),
    }
  }

  async prepareToggle(
    name: string,
    enabled: boolean,
    target: McpTarget,
  ): Promise<McpPreparedMutation> {
    this.assertTargetOwner(target)
    if (this.capabilities.toggle !== 'native') {
      throw new McpOperationError(
        'MCP_TOGGLE_UNSUPPORTED',
        `${this.displayName} 不支持直接启停 MCP Server`,
      )
    }
    const { source, text, servers, beforeHash } = await this.readTarget(target)
    const current = servers[name]
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      throw new McpOperationError('MCP_SERVER_NOT_FOUND', `目标中不存在 MCP Server ${name}`)
    }
    const nativeValue: McpConfigObject = {
      ...current,
      enabled,
    }
    const afterText = codecFor(source).upsertServer(text, source.nodePath, name, nativeValue)
    return {
      kind: 'toggle',
      name,
      source,
      beforeHash,
      beforeText: text,
      afterText,
      nativeValue,
    }
  }

  private assertTargetOwner(target: McpTarget): void {
    if (target.agent !== this.agent || target.surface !== this.surface) {
      throw new McpOperationError(
        'MCP_TARGET_NOT_FOUND',
        `目标不属于 ${this.agent}:${this.surface}`,
      )
    }
  }

  private async readTarget(target: McpTarget): Promise<{
    source: McpConfigSource
    text: string
    servers: McpConfigObject
    beforeHash: string | null
  }> {
    const sources = await this.configSources(target.projectRoot ? [target.projectRoot] : [])
    const source = sources.find(
      (candidate) =>
        candidate.scope === target.scope &&
        (candidate.projectRoot ?? '') === (target.projectRoot ? resolve(target.projectRoot) : ''),
    )
    if (!source) {
      throw new McpOperationError(
        'MCP_TARGET_NOT_FOUND',
        `${this.displayName} 没有匹配的 ${target.scope} MCP 配置来源`,
      )
    }
    const text = source.exists ? await fs.readFile(source.configPath, 'utf8') : ''
    return {
      source,
      text,
      servers: codecFor(source).readServers(text, source.nodePath),
      beforeHash: source.exists ? hashMcpSource(text) : null,
    }
  }
}
