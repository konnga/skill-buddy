import { McpOperationError } from './operations.js'
import type { McpServerDefinition } from './types.js'

export const SENSITIVE_MCP_ARGUMENT = /(token|secret|password|passwd|api[-_]?key|authorization)/i
export const SENSITIVE_MCP_URL_KEY = /(token|secret|password|passwd|api[-_]?key|auth|signature)/i

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/
const REDACTED = '[redacted]'

export interface ValidateMcpDefinitionOptions {
  /**
   * 定义来源。`user-input`（默认）表示表单、registry 发布或 CLI 安装等新建路径，
   * 疑似明文凭据与脱敏占位符直接拒绝；`scan` 表示本机扫描得到的定义（同步路径），
   * 已脱敏字段由 nonExportableFields 对应的计划阻断项处理，这里只做结构校验。
   */
  source?: 'user-input' | 'scan'
}

function reject(message: string): never {
  throw new McpOperationError('MCP_WRITE_VALIDATION_FAILED', message)
}

/**
 * 找出疑似内嵌明文凭据的参数。与 normalize 的脱敏启发式保持一致：
 * 仅识别 flag（-x/--xx）或 KEY=VALUE 形式；裸参数（如包名 @acme/token-mcp）
 * 与布尔开关（--no-token-cache 后跟另一个 flag）不算凭据。
 */
function embeddedSecretArgument(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    const equalIndex = argument.indexOf('=')
    const flag = equalIndex >= 0 ? argument.slice(0, equalIndex) : argument
    if (!flag.startsWith('-') && equalIndex < 0) continue
    if (!SENSITIVE_MCP_ARGUMENT.test(flag)) continue
    if (equalIndex >= 0) {
      if (argument.length > equalIndex + 1) return argument
      continue
    }
    const next = args[index + 1]
    if (next !== undefined && !next.startsWith('-')) return argument
  }
  return undefined
}

function validateReferences(value: unknown, label: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject(`MCP ${label} 引用无效`)
  }
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key || CONTROL_CHAR.test(key) || typeof raw !== 'object' || raw === null) {
      reject(`MCP ${label} 引用无效`)
    }
    const reference = raw as Record<string, unknown>
    if (reference.kind === 'literal') {
      reject(`MCP ${label} 不接受明文字面量，请使用环境变量引用`)
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

/** 校验平台中立 MCP 定义；desktop IPC、CLI 安装与 registry 发布共用这一份规则。 */
export function validateMcpDefinition(
  definition: McpServerDefinition,
  options: ValidateMcpDefinitionOptions = {},
): void {
  const fromUserInput = (options.source ?? 'user-input') === 'user-input'
  const candidate = definition as unknown
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    reject('MCP Server 定义无效')
  }
  const value = candidate as Record<string, unknown>
  if (
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 128 ||
    CONTROL_CHAR.test(value.name)
  ) {
    reject('MCP Server 名称无效')
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    reject('MCP Server 描述无效')
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
  if (transport.kind === 'stdio') {
    if (
      typeof transport.command !== 'string' ||
      !transport.command.trim() ||
      transport.command.includes('\0')
    ) {
      reject('stdio MCP Server 必须提供 command')
    }
    if (
      !Array.isArray(transport.args) ||
      transport.args.some((argument) => typeof argument !== 'string' || argument.includes('\0'))
    ) {
      reject('stdio MCP Server 参数无效')
    }
    const args = transport.args as string[]
    if (fromUserInput) {
      if (args.includes(REDACTED)) {
        reject('stdio MCP Server 参数不能包含脱敏占位符')
      }
      const suspicious = embeddedSecretArgument(args)
      if (suspicious !== undefined) {
        reject(`stdio MCP Server 参数 ${suspicious} 疑似包含明文凭据，请改用环境变量引用`)
      }
    }
    if (
      transport.cwd !== undefined &&
      (typeof transport.cwd !== 'string' || transport.cwd.includes('\0'))
    ) {
      reject('stdio MCP Server cwd 无效')
    }
    validateReferences(transport.env, 'env')
    return
  }

  if (!['streamable-http', 'sse', 'websocket'].includes(String(transport.kind))) {
    reject('MCP Server transport 类型不受支持')
  }
  if (typeof transport.url !== 'string') reject('远程 MCP Server 必须提供 URL')
  let url: URL | null = null
  try {
    url = new URL(transport.url as string)
  } catch {
    reject('远程 MCP Server URL 无效')
  }
  if (!url) reject('远程 MCP Server URL 无效')
  const allowedProtocols =
    transport.kind === 'websocket'
      ? ['ws:', 'wss:', 'http:', 'https:']
      : ['http:', 'https:']
  if (!allowedProtocols.includes(url.protocol)) {
    reject(`${String(transport.kind)} MCP Server 的 URL 协议不受支持`)
  }
  if (url.username || url.password) reject('远程 MCP Server URL 不能包含凭据')
  if (url.hash) reject('远程 MCP Server URL 不能包含片段')
  if (fromUserInput) {
    if ((transport.url as string).includes(REDACTED)) {
      reject('远程 MCP Server URL 不能包含脱敏占位符')
    }
    for (const [key, entry] of url.searchParams) {
      if (SENSITIVE_MCP_URL_KEY.test(key) && entry) {
        reject(`远程 MCP Server URL 查询参数 ${key} 疑似包含凭据，请改用 Header 环境变量引用`)
      }
    }
  }
  validateReferences(transport.headers, 'Header')
}
