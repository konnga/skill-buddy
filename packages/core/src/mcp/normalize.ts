import { createHash } from 'node:crypto'
import type { McpConfigObject, McpConfigValue } from './codecs/index.js'
import type {
  McpAuthState,
  McpServerDefinition,
  McpTransportKind,
  McpValueRef,
} from './types.js'
import type { McpNativeSchema } from './catalog.js'

const ENV_REFERENCE_PATTERNS = [/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/, /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/]
const SENSITIVE_ARGUMENT = /(token|secret|password|passwd|api[-_]?key|authorization)/i
const SENSITIVE_URL_KEY = /(token|secret|password|passwd|api[-_]?key|auth|signature)/i

interface NormalizedNativeServer {
  definition: McpServerDefinition
  enabled: boolean | null
  authState: McpAuthState
  platformMetadata: Record<string, unknown>
}

function stringArray(value: McpConfigValue | undefined): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value
    : []
}

function stringValue(value: McpConfigValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function objectValue(value: McpConfigValue | undefined): McpConfigObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {}
}

function referenceFromNative(value: McpConfigValue, key: string): McpValueRef {
  if (typeof value === 'string') {
    for (const pattern of ENV_REFERENCE_PATTERNS) {
      const match = pattern.exec(value)
      if (match) return { kind: 'env', name: match[1]! }
    }
  }
  return { kind: 'secret', key, state: 'configured' }
}

function referenceMap(value: McpConfigValue | undefined): Record<string, McpValueRef> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).map(([key, entry]) => [key, referenceFromNative(entry, key)]),
  )
}

function referenceRequirement(ref: McpValueRef): string | undefined {
  if (ref.kind === 'env') return ref.name
  if (ref.kind === 'secret') return ref.key
  return undefined
}

function redactArgs(args: string[]): { args: string[]; secretKeys: string[] } {
  const secretKeys: string[] = []
  let redactNext = false
  const redacted = args.map((argument) => {
    if (redactNext) {
      redactNext = false
      return '[redacted]'
    }
    const equalIndex = argument.indexOf('=')
    const flag = equalIndex >= 0 ? argument.slice(0, equalIndex) : argument
    if (!SENSITIVE_ARGUMENT.test(flag)) return argument
    const key = flag.replace(/^-+/, '').replaceAll('-', '_').toUpperCase() || 'ARGUMENT_SECRET'
    secretKeys.push(key)
    if (equalIndex >= 0) return `${flag}=[redacted]`
    redactNext = true
    return argument
  })
  return { args: redacted, secretKeys }
}

function redactUrl(value: string): { url: string; secretKeys: string[] } {
  try {
    const url = new URL(value)
    const secretKeys: string[] = []
    if (url.username || url.password) {
      url.username = '[redacted]'
      url.password = '[redacted]'
      secretKeys.push('URL_CREDENTIALS')
    }
    for (const key of [...url.searchParams.keys()]) {
      const secretKey = `URL_QUERY_${key.replaceAll('-', '_').toUpperCase()}`
      if (SENSITIVE_URL_KEY.test(key) || url.searchParams.get(key)) {
        url.searchParams.set(key, '[redacted]')
        secretKeys.push(secretKey)
      }
    }
    url.hash = ''
    return { url: url.toString(), secretKeys }
  } catch {
    return { url: '[redacted-invalid-url]', secretKeys: ['REMOTE_URL'] }
  }
}

function nativeEnabled(value: McpConfigObject): boolean | null {
  if (typeof value.enabled === 'boolean') return value.enabled
  if (typeof value.disabled === 'boolean') return !value.disabled
  return null
}

function nativeTransport(
  schema: McpNativeSchema,
  value: McpConfigObject,
): Exclude<McpTransportKind, 'stdio'> {
  const type = stringValue(value.type)?.toLowerCase()
  if (type === 'sse') return 'sse'
  if (type === 'websocket' || type === 'ws') return 'websocket'
  if (schema === 'opencode' && type === 'remote') return 'streamable-http'
  return 'streamable-http'
}

function metadataFor(schema: McpNativeSchema, value: McpConfigObject): Record<string, unknown> {
  const known = new Set(
    schema === 'opencode'
      ? ['type', 'command', 'environment', 'url', 'headers', 'enabled', 'oauth']
      : schema === 'codex'
        ? [
            'command',
            'args',
            'cwd',
            'env',
            'url',
            'http_headers',
            'env_http_headers',
            'enabled',
          ]
        : ['type', 'command', 'args', 'cwd', 'env', 'url', 'headers', 'enabled', 'disabled'],
  )
  return {
    schema,
    nativeKeys: Object.keys(value),
    extensionKeys: Object.keys(value).filter((key) => !known.has(key)),
  }
}

function authState(
  refs: Record<string, McpValueRef>,
  environment: NodeJS.ProcessEnv,
  requiresOAuth: boolean,
): McpAuthState {
  if (requiresOAuth) return 'requires-oauth'
  const values = Object.values(refs)
  if (values.some((ref) => ref.kind === 'env' && !environment[ref.name])) {
    return 'missing-secrets'
  }
  if (values.some((ref) => ref.kind === 'secret' && ref.state === 'missing')) {
    return 'missing-secrets'
  }
  if (values.length === 0) return 'ready'
  return values.every((ref) => ref.kind !== 'secret' || ref.state === 'configured')
    ? 'ready'
    : 'unknown'
}

/** 将平台原生 Server 配置转换为不包含真实凭据的统一定义。 */
export function normalizeNativeMcpServer(
  name: string,
  value: McpConfigObject,
  schema: McpNativeSchema,
  environment: NodeJS.ProcessEnv = process.env,
): NormalizedNativeServer {
  const enabled = nativeEnabled(value)
  const commandArray = schema === 'opencode' ? stringArray(value.command) : []
  const command = schema === 'opencode' ? commandArray[0] : stringValue(value.command)
  const rawArgs = schema === 'opencode' ? commandArray.slice(1) : stringArray(value.args)
  const rawEnv = schema === 'opencode' ? value.environment : value.env

  if (command) {
    const env = referenceMap(rawEnv)
    const { args, secretKeys } = redactArgs(rawArgs)
    const requiredSecrets = new Set([
      ...Object.values(env).flatMap((ref) => referenceRequirement(ref) ?? []),
      ...secretKeys,
    ])
    return {
      definition: {
        name,
        transport: {
          kind: 'stdio',
          command,
          args,
          cwd: stringValue(value.cwd),
          env,
        },
        requiredSecrets: [...requiredSecrets].sort(),
        metadata:
          secretKeys.length > 0 ? { nonExportableFields: ['transport.args'] } : undefined,
      },
      enabled,
      authState: authState(env, environment, false),
      platformMetadata: metadataFor(schema, value),
    }
  }

  const rawUrl = stringValue(value.url) ?? stringValue(value.httpUrl) ?? stringValue(value.serverUrl)
  if (!rawUrl) throw new Error(`MCP server ${name} has neither command nor url`)
  const headerValue = schema === 'codex' ? value.http_headers : value.headers
  const headers = referenceMap(headerValue)
  if (schema === 'codex') {
    for (const [header, envName] of Object.entries(objectValue(value.env_http_headers))) {
      if (typeof envName === 'string') headers[header] = { kind: 'env', name: envName }
    }
  }
  const { url, secretKeys } = redactUrl(rawUrl)
  const requiredSecrets = new Set([
    ...Object.values(headers).flatMap((ref) => referenceRequirement(ref) ?? []),
    ...secretKeys,
  ])
  const requiresOAuth = value.oauth !== undefined && value.oauth !== false

  return {
    definition: {
      name,
      transport: {
        kind: nativeTransport(schema, value),
        url,
        headers,
      },
      requiredSecrets: [...requiredSecrets].sort(),
      metadata:
        secretKeys.length > 0
          ? { nonExportableFields: ['transport.url'], redactedUrl: true }
          : undefined,
    },
    enabled,
    authState: authState(headers, environment, requiresOAuth),
    platformMetadata: metadataFor(schema, value),
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'state')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

/** 计算不包含凭据值和本机认证状态的稳定定义 Hash。 */
export function hashMcpDefinition(definition: McpServerDefinition): string {
  return createHash('sha256').update(JSON.stringify(stableValue(definition))).digest('hex')
}

export function hashMcpSource(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function stableMcpId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex')
}
