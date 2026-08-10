import {
  jsonMcpConfigCodec,
  jsoncMcpConfigCodec,
  tomlMcpConfigCodec,
  type McpConfigObject,
  type McpConfigValue,
} from './codecs/index.js'
import type { McpNativeSchema, McpPlatformProfile } from './catalog.js'
import type {
  McpConfigSource,
  McpScope,
  McpServerDefinition,
  McpValueRef,
} from './types.js'
import type { AgentId } from '../types.js'

export type McpOperationErrorCode =
  | 'MCP_TARGET_NOT_FOUND'
  | 'MCP_TARGET_READ_ONLY'
  | 'MCP_TRANSPORT_UNSUPPORTED'
  | 'MCP_SCOPE_UNSUPPORTED'
  | 'MCP_SECRET_NOT_EXPORTABLE'
  | 'MCP_REFERENCE_UNSUPPORTED'
  | 'MCP_TOGGLE_UNSUPPORTED'
  | 'MCP_SERVER_NOT_FOUND'
  | 'MCP_CONFIG_CHANGED'
  | 'MCP_WRITE_VALIDATION_FAILED'
  | 'MCP_WRITE_FAILED'

export interface McpPlanIssue {
  code: McpOperationErrorCode
  message: string
  field?: string
}

export interface McpTarget {
  agent: AgentId
  surface: string
  scope: McpScope
  projectRoot?: string
}

export interface McpProjection {
  target: McpTarget
  nativeValue?: McpConfigObject
  blockers: McpPlanIssue[]
  warnings: McpPlanIssue[]
  requiredSecrets: string[]
}

export interface McpPlanIssueView {
  code: string
  message: string
  field?: string
  target?: McpTarget
}

export interface McpPlanActionView {
  kind: McpMutationKind
  name: string
  target: McpTarget
  sourceId: string
  configPath: string
  changed: boolean
}

export interface McpOperationPlanView {
  planId: string
  kind: McpMutationKind
  name: string
  expiresAt: number
  actions: McpPlanActionView[]
  blockers: McpPlanIssueView[]
  warnings: McpPlanIssueView[]
  canApply: boolean
}

export interface McpOperationRequestResult {
  operationId: string
  results: {
    sourceId: string
    path: string
    ok: boolean
    code?: string
    error?: string
  }[]
}

export type McpMutationKind = 'upsert' | 'remove' | 'toggle'

/** 仅允许保存在主进程内存中的待写操作，不得通过 IPC 返回原文。 */
export interface McpPreparedMutation {
  kind: McpMutationKind
  name: string
  source: McpConfigSource
  beforeHash: string | null
  beforeText: string
  afterText: string
  nativeValue?: McpConfigObject
  projection?: McpProjection
}

export class McpOperationError extends Error {
  readonly code: McpOperationErrorCode
  readonly issues: McpPlanIssue[]

  constructor(code: McpOperationErrorCode, message: string, issues: McpPlanIssue[] = []) {
    super(message)
    this.name = 'McpOperationError'
    this.code = code
    this.issues = issues
  }
}

function referenceValue(
  ref: McpValueRef,
  syntax: 'standard' | 'opencode',
  field: string,
  warnings: McpPlanIssue[],
): string | undefined {
  if (ref.kind === 'literal') return ref.value
  if (ref.kind === 'env') return syntax === 'opencode' ? `{env:${ref.name}}` : `\${${ref.name}}`
  const environmentName = ref.key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
  warnings.push({
    code: 'MCP_SECRET_NOT_EXPORTABLE',
    field,
    message: `不会复制密钥 ${ref.key}；目标端需要环境变量 ${environmentName}`,
  })
  return syntax === 'opencode' ? `{env:${environmentName}}` : `\${${environmentName}}`
}

function projectReferenceMap(
  refs: Record<string, McpValueRef>,
  syntax: 'standard' | 'opencode',
  field: string,
  warnings: McpPlanIssue[],
): McpConfigObject {
  return Object.fromEntries(
    Object.entries(refs).flatMap(([key, ref]) => {
      const value = referenceValue(ref, syntax, `${field}.${key}`, warnings)
      return value === undefined ? [] : [[key, value]]
    }),
  )
}

function codexStdio(
  definition: McpServerDefinition,
  blockers: McpPlanIssue[],
  warnings: McpPlanIssue[],
): McpConfigObject {
  if (definition.transport.kind !== 'stdio') return {}
  const native: McpConfigObject = {
    command: definition.transport.command,
    args: definition.transport.args,
  }
  if (definition.transport.cwd) native.cwd = definition.transport.cwd

  const env: McpConfigObject = {}
  const envVars: McpConfigValue[] = []
  for (const [key, ref] of Object.entries(definition.transport.env)) {
    if (ref.kind === 'literal') env[key] = ref.value
    else if (ref.kind === 'env' && ref.name === key) envVars.push(ref.name)
    else if (ref.kind === 'env') {
      blockers.push({
        code: 'MCP_REFERENCE_UNSUPPORTED',
        field: `transport.env.${key}`,
        message: `Codex 无法把环境变量 ${ref.name} 映射为不同名称 ${key}`,
      })
    } else {
      const environmentName = ref.key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
      warnings.push({
        code: 'MCP_SECRET_NOT_EXPORTABLE',
        field: `transport.env.${key}`,
        message: `不会复制密钥 ${ref.key}；Codex 需要环境变量 ${environmentName}`,
      })
      if (environmentName === key) envVars.push(environmentName)
      else {
        blockers.push({
          code: 'MCP_REFERENCE_UNSUPPORTED',
          field: `transport.env.${key}`,
          message: `Codex 无法把环境变量 ${environmentName} 映射为不同名称 ${key}`,
        })
      }
    }
  }
  if (Object.keys(env).length > 0) native.env = env
  if (envVars.length > 0) native.env_vars = envVars
  return native
}

function codexRemote(
  definition: McpServerDefinition,
  warnings: McpPlanIssue[],
): McpConfigObject {
  if (definition.transport.kind === 'stdio') return {}
  const native: McpConfigObject = { url: definition.transport.url }
  const literalHeaders: McpConfigObject = {}
  const envHeaders: McpConfigObject = {}
  for (const [header, ref] of Object.entries(definition.transport.headers)) {
    if (ref.kind === 'literal') literalHeaders[header] = ref.value
    else if (ref.kind === 'env') envHeaders[header] = ref.name
    else {
      const environmentName = ref.key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
      warnings.push({
        code: 'MCP_SECRET_NOT_EXPORTABLE',
        field: `transport.headers.${header}`,
        message: `不会复制 Header ${header}；Codex 需要环境变量 ${environmentName}`,
      })
      envHeaders[header] = environmentName
    }
  }
  if (Object.keys(literalHeaders).length > 0) native.http_headers = literalHeaders
  if (Object.keys(envHeaders).length > 0) native.env_http_headers = envHeaders
  return native
}

function standardProjection(
  definition: McpServerDefinition,
  schema: McpNativeSchema,
  blockers: McpPlanIssue[],
  warnings: McpPlanIssue[],
): McpConfigObject {
  if (schema === 'codex') {
    return definition.transport.kind === 'stdio'
      ? codexStdio(definition, blockers, warnings)
      : codexRemote(definition, warnings)
  }

  const syntax = schema === 'opencode' ? 'opencode' : 'standard'
  if (definition.transport.kind === 'stdio') {
    const env = projectReferenceMap(
      definition.transport.env,
      syntax,
      'transport.env',
      warnings,
    )
    if (schema === 'opencode') {
      return {
        type: 'local',
        command: [definition.transport.command, ...definition.transport.args],
        ...(Object.keys(env).length > 0 ? { environment: env } : {}),
      }
    }
    return {
      type: 'stdio',
      command: definition.transport.command,
      args: definition.transport.args,
      ...(definition.transport.cwd ? { cwd: definition.transport.cwd } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    }
  }

  const headers = projectReferenceMap(
    definition.transport.headers,
    syntax,
    'transport.headers',
    warnings,
  )
  if (schema === 'opencode') {
    return {
      type: 'remote',
      url: definition.transport.url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    }
  }
  const type =
    definition.transport.kind === 'streamable-http'
      ? 'http'
      : definition.transport.kind === 'websocket'
        ? 'ws'
        : 'sse'
  return {
    type,
    url: definition.transport.url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  }
}

/** 把平台中立定义投影为目标平台原生配置，并明确所有阻断项。 */
export function projectMcpDefinition(
  definition: McpServerDefinition,
  target: McpTarget,
  profile: McpPlatformProfile,
): McpProjection {
  const blockers: McpPlanIssue[] = []
  const warnings: McpPlanIssue[] = []
  if (profile.capabilities.management === 'read-only') {
    blockers.push({
      code: 'MCP_TARGET_READ_ONLY',
      message: `${profile.displayName} 当前仅支持只读扫描`,
    })
  }
  if (!profile.capabilities.scopes.includes(target.scope)) {
    blockers.push({
      code: 'MCP_SCOPE_UNSUPPORTED',
      message: `${profile.displayName} 不支持 ${target.scope} 作用域`,
    })
  }
  if (!profile.capabilities.transports.includes(definition.transport.kind)) {
    blockers.push({
      code: 'MCP_TRANSPORT_UNSUPPORTED',
      field: 'transport.kind',
      message: `${profile.displayName} 不支持 ${definition.transport.kind} 传输`,
    })
  }
  const nonExportableFields = Array.isArray(definition.metadata?.nonExportableFields)
    ? definition.metadata.nonExportableFields.filter(
        (field): field is string => typeof field === 'string',
      )
    : []
  for (const field of nonExportableFields) {
    blockers.push({
      code: 'MCP_SECRET_NOT_EXPORTABLE',
      field,
      message: `源配置的 ${field} 包含不可导出的凭据，需要手动重建`,
    })
  }

  const nativeValue = standardProjection(definition, profile.schema, blockers, warnings)
  return {
    target,
    nativeValue,
    blockers,
    warnings,
    requiredSecrets: [...definition.requiredSecrets],
  }
}

export function nativeKnownKeys(schema: McpNativeSchema): Set<string> {
  if (schema === 'opencode') {
    return new Set(['type', 'command', 'environment', 'url', 'headers', 'enabled', 'oauth'])
  }
  if (schema === 'codex') {
    return new Set([
      'command',
      'args',
      'cwd',
      'env',
      'env_vars',
      'url',
      'http_headers',
      'env_http_headers',
      'enabled',
    ])
  }
  return new Set([
    'type',
    'command',
    'args',
    'cwd',
    'env',
    'url',
    'headers',
    'enabled',
    'disabled',
  ])
}

/** 将同一配置文件中的后续操作重放到前一个操作结果上，用于合并多目标计划。 */
export function rebaseMcpMutation(mutation: McpPreparedMutation, text: string): string {
  const codec =
    mutation.source.format === 'toml'
      ? tomlMcpConfigCodec
      : mutation.source.format === 'jsonc'
        ? jsoncMcpConfigCodec
        : jsonMcpConfigCodec
  if (mutation.kind === 'remove') {
    return codec.removeServer(text, mutation.source.nodePath, mutation.name)
  }
  if (!mutation.nativeValue) {
    throw new McpOperationError('MCP_WRITE_FAILED', '待写 MCP 操作缺少原生配置')
  }
  return codec.upsertServer(text, mutation.source.nodePath, mutation.name, mutation.nativeValue)
}
