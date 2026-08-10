import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import {
  allMcpAdapters,
  McpOperationError,
  rebaseMcpMutation,
  scanMcpServers,
  transactionalWriteMcpConfig,
  type McpAdapter,
  type McpConfigSource,
  type McpOperationPlanView,
  type McpOperationRequestResult,
  type McpPlanActionView,
  type McpPlanIssueView,
  type McpPreparedMutation,
  type McpScanResult,
  type McpServerDefinition,
  type McpTarget,
} from '@skillbuddy/core'
import type {
  McpRemovePlanRequest,
  McpTogglePlanRequest,
  McpUpsertPlanRequest,
} from '../../shared/ipc.js'
import { McpBackupStore } from './backups.js'
import { McpPathAccessPolicy } from './path-policy.js'
import { McpConfigWatcher } from './watcher.js'

interface StoredPlan {
  view: McpOperationPlanView
  mutations: McpPreparedMutation[]
}

const PLAN_TTL = 5 * 60_000
const BACKUP_TTL = 60_000
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const SENSITIVE_ARGUMENT = /(token|secret|password|passwd|api[-_]?key|authorization)/i

export interface McpServiceOptions {
  adapters?: readonly McpAdapter[]
  planTtl?: number
  backupTtl?: number
}

function targetOfSource(source: McpConfigSource): McpTarget {
  return {
    agent: source.agent,
    surface: source.surface,
    scope: source.scope,
    projectRoot: source.projectRoot,
  }
}

function issueView(
  issue: { code: string; message: string; field?: string },
  target?: McpTarget,
): McpPlanIssueView {
  return { ...issue, target }
}

function validateDefinition(definition: McpServerDefinition): void {
  const reject = (message: string): never => {
    throw new McpOperationError('MCP_WRITE_VALIDATION_FAILED', message)
  }
  const candidate = definition as unknown
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    reject('MCP Server 定义无效')
  }
  const value = candidate as Record<string, unknown>
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 128 ||
    value.name.includes('\0')
  ) {
    reject('MCP Server 名称无效')
  }
  if (
    !Array.isArray(value.requiredSecrets) ||
    value.requiredSecrets.some(
      (secret) => typeof secret !== 'string' || !ENV_NAME_RE.test(secret),
    )
  ) {
    reject('MCP Server requiredSecrets 只能包含环境变量名称')
  }
  if (typeof value.transport !== 'object' || value.transport === null) {
    reject('MCP Server transport 无效')
  }

  const transport = value.transport as Record<string, unknown>
  let references: unknown
  if (transport.kind === 'stdio') {
    if (typeof transport.command !== 'string' || !transport.command.trim()) {
      reject('stdio MCP Server 必须提供 command')
    }
    if (
      !Array.isArray(transport.args) ||
      transport.args.some(
        (argument) =>
          typeof argument !== 'string' ||
          argument.includes('\0') ||
          argument === '[redacted]' ||
          SENSITIVE_ARGUMENT.test(argument),
      )
    ) {
      reject('stdio MCP Server 参数不能包含疑似凭据或脱敏占位符')
    }
    if (
      transport.cwd !== undefined &&
      (typeof transport.cwd !== 'string' || transport.cwd.includes('\0'))
    ) {
      reject('stdio MCP Server cwd 无效')
    }
    references = transport.env
  } else {
    if (!['streamable-http', 'sse', 'websocket'].includes(String(transport.kind))) {
      reject('MCP Server transport 类型不受支持')
    }
    if (typeof transport.url !== 'string') reject('远程 MCP Server 必须提供 HTTP(S) URL')
    let url: URL | null = null
    try {
      url = new URL(transport.url as string)
    } catch {
      reject('远程 MCP Server URL 无效')
    }
    if (!url) {
      throw new McpOperationError('MCP_WRITE_VALIDATION_FAILED', '远程 MCP Server URL 无效')
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      reject('远程 MCP Server URL 不能包含凭据、查询参数或片段')
    }
    references = transport.headers
  }

  if (typeof references !== 'object' || references === null || Array.isArray(references)) {
    reject('MCP env/Header 引用无效')
  }
  const referenceRecord = references as Record<string, unknown>
  for (const [key, rawReference] of Object.entries(referenceRecord)) {
    if (!key || key.includes('\0') || typeof rawReference !== 'object' || rawReference === null) {
      reject('MCP env/Header 引用无效')
    }
    const reference = rawReference as Record<string, unknown>
    if (reference.kind === 'literal') {
      reject('IPC 不接受 MCP env/Header 明文字面量，请使用环境变量引用')
    }
    if (reference.kind === 'env') {
      if (typeof reference.name !== 'string' || !ENV_NAME_RE.test(reference.name)) {
        reject('MCP 环境变量引用名称无效')
      }
      continue
    }
    if (
      reference.kind !== 'secret' ||
      typeof reference.key !== 'string' ||
      !ENV_NAME_RE.test(reference.key) ||
      !['configured', 'missing', 'unknown'].includes(String(reference.state))
    ) {
      reject('MCP 密钥引用无效')
    }
  }
}

/** MCP 主进程领域服务：计划内容留在主进程，Renderer 只持有短期 planId。 */
export class McpService {
  readonly #adapters: readonly McpAdapter[]
  readonly #adapterMap: Map<string, McpAdapter>
  readonly #backupTtl: number
  readonly #plans = new Map<string, StoredPlan>()
  readonly #planTtl: number
  readonly #policy = new McpPathAccessPolicy()
  readonly #backups: McpBackupStore
  readonly #watcher = new McpConfigWatcher()
  #projectRoots: string[] = []
  #lastScan: McpScanResult | null = null
  #sources: McpConfigSource[] = []

  constructor(backupRoot: string, options: McpServiceOptions = {}) {
    this.#adapters = options.adapters ?? allMcpAdapters()
    this.#adapterMap = new Map(
      this.#adapters.map((adapter) => [`${adapter.agent}:${adapter.surface}`, adapter]),
    )
    this.#planTtl = options.planTtl ?? PLAN_TTL
    this.#backupTtl = options.backupTtl ?? BACKUP_TTL
    this.#backups = new McpBackupStore(backupRoot)
  }

  async scan(projectRoots: string[] = []): Promise<McpScanResult> {
    this.#projectRoots = [...new Set(projectRoots.map((root) => resolve(root)))]
    this.#sources = (
      await Promise.all(
        this.#adapters.map((adapter) => adapter.configSources(this.#projectRoots)),
      )
    ).flat()
    this.#policy.setSources(this.#sources, this.#projectRoots)
    this.#lastScan = await scanMcpServers(this.#projectRoots, this.#adapters)
    return this.#lastScan
  }

  watch(onChange: () => void): number {
    return this.#watcher.start(this.#sources, onChange)
  }

  dispose(): void {
    this.#watcher.stop()
  }

  async createUpsertPlan(request: McpUpsertPlanRequest): Promise<McpOperationPlanView> {
    const scan = await this.scan(request.projectRoots)
    const definition = request.definition
      ? request.definition
      : scan.installations.find((item) => item.id === request.sourceInstallationId)?.definition
    if (!definition) throw new Error('找不到用于同步的 MCP Server 定义')
    validateDefinition(definition)
    return this.createPlan('upsert', definition.name, request.targets, async (target) => {
      const adapter = this.getAdapter(target)
      const projection = adapter.project(definition, target)
      if (projection.blockers.length > 0) {
        return {
          blockers: projection.blockers.map((issue) => issueView(issue, target)),
          warnings: projection.warnings.map((issue) => issueView(issue, target)),
        }
      }
      return {
        mutation: await adapter.prepareUpsert(definition, target),
        warnings: projection.warnings.map((issue) => issueView(issue, target)),
      }
    })
  }

  async createRemovePlan(request: McpRemovePlanRequest): Promise<McpOperationPlanView> {
    const scan = await this.scan(request.projectRoots)
    const installations = request.installationIds.map((id) =>
      scan.installations.find((item) => item.id === id),
    )
    if (installations.some((item) => !item)) throw new Error('找不到待卸载的 MCP 安装')
    const items = installations.filter((item): item is NonNullable<typeof item> => Boolean(item))
    const name = items[0]?.definition.name
    if (!name || items.some((item) => item.definition.name !== name)) {
      throw new Error('一次卸载计划只能处理同一个 MCP Server')
    }
    return this.createPlan(
      'remove',
      name,
      items.map((item) => targetOfSource(item.source)),
      async (target) => ({
        mutation: await this.getAdapter(target).prepareRemove(name, target),
      }),
    )
  }

  async createTogglePlan(request: McpTogglePlanRequest): Promise<McpOperationPlanView> {
    const scan = await this.scan(request.projectRoots)
    const installations = request.installationIds.map((id) =>
      scan.installations.find((item) => item.id === id),
    )
    if (installations.some((item) => !item)) throw new Error('找不到待切换的 MCP 安装')
    const items = installations.filter((item): item is NonNullable<typeof item> => Boolean(item))
    const name = items[0]?.definition.name
    if (!name || items.some((item) => item.definition.name !== name)) {
      throw new Error('一次启停计划只能处理同一个 MCP Server')
    }
    return this.createPlan(
      'toggle',
      name,
      items.map((item) => targetOfSource(item.source)),
      async (target) => ({
        mutation: await this.getAdapter(target).prepareToggle(
          name,
          request.enabled,
          target,
        ),
      }),
    )
  }

  async applyPlan(planId: string): Promise<McpOperationRequestResult> {
    const stored = this.#plans.get(planId)
    if (!stored || stored.view.expiresAt < Date.now()) {
      this.#plans.delete(planId)
      throw new Error('MCP 操作计划已过期，请重新预览')
    }
    if (stored.view.blockers.length > 0) throw new Error('MCP 操作计划包含阻断项')
    if (!stored.view.canApply) throw new Error('MCP 操作计划没有可执行的变更')

    const operationId = randomUUID()
    const results: McpOperationRequestResult['results'] = []
    for (const mutation of stored.mutations) {
      let backup: Awaited<ReturnType<McpBackupStore['stage']>> | undefined
      try {
        await this.#policy.assertWritable(mutation)
        await transactionalWriteMcpConfig({
          path: mutation.source.configPath,
          content: mutation.afterText,
          expectedHash: mutation.beforeHash,
          beforeCommit: async (original) => {
            backup = await this.#backups.stage(operationId, mutation, original)
          },
        })
        results.push({ sourceId: mutation.source.id, path: mutation.source.configPath, ok: true })
      } catch (error) {
        if (backup) await this.#backups.discard(backup)
        const candidate = error as { code?: unknown; message?: unknown }
        results.push({
          sourceId: mutation.source.id,
          path: mutation.source.configPath,
          ok: false,
          code: typeof candidate.code === 'string' ? candidate.code : 'MCP_WRITE_FAILED',
          error: typeof candidate.message === 'string' ? candidate.message : String(error),
        })
      }
    }
    this.#plans.delete(planId)
    if (results.some((result) => result.ok)) this.#backups.expire(operationId, this.#backupTtl)
    return { operationId, results }
  }

  restore(operationId: string): Promise<{ path: string; ok: boolean; error?: string }[]> {
    return this.#backups.restore(operationId, this.#policy)
  }

  private async createPlan(
    kind: 'upsert' | 'remove' | 'toggle',
    name: string,
    targets: McpTarget[],
    prepare: (target: McpTarget) => Promise<{
      mutation?: McpPreparedMutation
      blockers?: McpPlanIssueView[]
      warnings?: McpPlanIssueView[]
    }>,
  ): Promise<McpOperationPlanView> {
    const planId = randomUUID()
    const expiresAt = Date.now() + this.#planTtl
    const blockers: McpPlanIssueView[] = []
    const warnings: McpPlanIssueView[] = []
    const actions: McpPlanActionView[] = []
    const mutations = new Map<string, McpPreparedMutation>()

    for (const target of targets) {
      this.assertTargetProject(target)
      try {
        const prepared = await prepare(target)
        blockers.push(...(prepared.blockers ?? []))
        warnings.push(...(prepared.warnings ?? []))
        if (!prepared.mutation) continue
        const mutation = prepared.mutation
        const key = resolve(mutation.source.configPath)
        const existing = mutations.get(key)
        const beforeActionText = existing?.afterText ?? mutation.beforeText
        if (existing) existing.afterText = rebaseMcpMutation(mutation, existing.afterText)
        else mutations.set(key, mutation)
        const afterActionText = (existing ?? mutation).afterText
        actions.push({
          kind,
          name,
          target,
          sourceId: mutation.source.id,
          configPath: mutation.source.configPath,
          changed: beforeActionText !== afterActionText,
        })
      } catch (error) {
        const candidate = error as { code?: unknown; message?: unknown }
        blockers.push({
          code: typeof candidate.code === 'string' ? candidate.code : 'MCP_WRITE_FAILED',
          message: typeof candidate.message === 'string' ? candidate.message : String(error),
          target,
        })
      }
    }

    const effectiveMutations = [...mutations.values()].filter(
      (mutation) => mutation.beforeText !== mutation.afterText,
    )
    const view: McpOperationPlanView = {
      planId,
      kind,
      name,
      expiresAt,
      actions,
      blockers,
      warnings,
      canApply: blockers.length === 0 && effectiveMutations.length > 0,
    }
    this.#plans.set(planId, { view, mutations: effectiveMutations })
    setTimeout(() => this.#plans.delete(planId), this.#planTtl).unref()
    return view
  }

  private getAdapter(target: McpTarget): McpAdapter {
    const adapter = this.#adapterMap.get(`${target.agent}:${target.surface}`)
    if (!adapter) throw new Error(`不支持 MCP 平台入口 ${target.agent}:${target.surface}`)
    return adapter
  }

  private assertTargetProject(target: McpTarget): void {
    if (target.scope === 'user') return
    if (!target.projectRoot || !this.#projectRoots.includes(resolve(target.projectRoot))) {
      throw new Error('MCP 目标项目未登记')
    }
  }
}
