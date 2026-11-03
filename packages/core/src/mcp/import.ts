/**
 * @file 把用户粘贴的客户端 MCP 配置反向解析成平台中立定义。
 *
 * 支持的输入形态：
 * - 整份客户端配置：`mcpServers` / `servers` / `mcp.servers` / `mcp_servers`，
 *   以及 `~/.claude.json` 这种按项目分组的 `projects.<path>.mcpServers`；
 * - 市场形态的配置数组（`[{ mcpServers: { ... } }]`），可能含多种安装方式；
 * - 单条 server 对象（`{ command, args, env }` 或 `{ url, headers }`）。
 *
 * 安全模型与 `validateMcpDefinition` 保持一致：env / header 里的明文值一律丢弃并
 * 改写为同名环境变量引用，参数里的明文凭据直接移除，两者都会产生可展示的告警。
 */
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import { isValidMcpEnvName, SENSITIVE_MCP_ARGUMENT } from './patterns.js'
import type { McpServerDefinition, McpValueRef } from './types.js'

/** 解析出的一个可导入候选，一个配置键对应一条。 */
export interface McpImportCandidate {
  /** 写入后的 server 名称；单条 server 没有显式名称时由包名或域名推导。 */
  serverName: string
  /** 供 UI 区分同一 server 的多种安装方式：命令行或远程 URL。 */
  label: string
  definition: McpServerDefinition
  /** 来自 `projects.<path>.mcpServers` 时的项目根目录，用于预选 local scope 目标。 */
  projectRoot?: string
}

/** 可展示给用户的告警；`code` 由 UI 负责翻译，`detail` 是相关字段或配置名。 */
export type McpImportWarningCode =
  | 'literal-discarded'
  | 'arg-secret-removed'
  | 'ignored-field'
  | 'unrecognized-server'
  | 'duplicate-entry'

export interface McpImportWarning {
  code: McpImportWarningCode
  serverName?: string
  detail?: string
}

export type McpImportErrorCode =
  | 'MCP_IMPORT_EMPTY'
  | 'MCP_IMPORT_PARSE_FAILED'
  | 'MCP_IMPORT_NO_SERVERS'

/** 结构化解析错误；`position` 只在 JSON 语法错误时存在。 */
export class McpImportError extends Error {
  readonly code: McpImportErrorCode
  readonly position?: { line: number; column: number }

  constructor(
    code: McpImportErrorCode,
    message: string,
    options: { position?: { line: number; column: number }; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'McpImportError'
    this.code = code
    this.position = options.position
  }
}

export interface McpImportOptions {
  /** 配置自身没有描述时使用的兜底描述（市场详情会带下来）。 */
  description?: string
  /** 额外声明的必需密钥，例如魔搭 `env_schema` 里的必填项。 */
  extraSecrets?: readonly string[]
}

export interface McpImportResult {
  candidates: McpImportCandidate[]
  warnings: McpImportWarning[]
}

/** 环境变量占位符：`${VAR}` 与 `{env:VAR}` 两种客户端写法。 */
const ENV_PLACEHOLDERS = [
  /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/,
  /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/,
] as const

/** 承载 server 映射的顶层键，按客户端差异排列。 */
const SERVER_CONTAINER_KEYS = ['mcpServers', 'servers', 'mcp_servers'] as const

/** 能被导入表达的字段；其余字段会以 `ignored-field` 告警提示用户。 */
const IMPORTED_KEYS = new Set([
  'args',
  'baseUrl',
  'command',
  'cwd',
  'description',
  'endpoint',
  'env',
  'env_http_headers',
  'env_vars',
  'environment',
  'headers',
  'httpUrl',
  'http_headers',
  'id',
  'mcpServers',
  'name',
  'serverName',
  'serverUrl',
  'transport',
  'type',
  'url',
  'version',
])

/** 远程 URL 的字段别名，按优先级排列。 */
const URL_KEYS = ['url', 'baseUrl', 'serverUrl', 'httpUrl', 'endpoint'] as const

/** 子目录递归上限，防止异常嵌套输入拖垮渲染。 */
const MAX_DEPTH = 4

const NAME_PREFIXES = ['mcp-server-', 'mcp-', 'server-'] as const
const HOST_PREFIXES = new Set(['www', 'mcp', 'api', 'sse'])

interface CollectedServer {
  serverName: string
  raw: Record<string, unknown>
  projectRoot?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function stringField(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const entry = value[key]
    if (typeof entry === 'string' && entry.trim()) return entry.trim()
  }
  return undefined
}

function positionOf(text: string, offset: number): { line: number; column: number } {
  const head = text.slice(0, Math.max(0, Math.min(offset, text.length)))
  const lines = head.split('\n')
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

// eslint-disable-next-line no-control-regex -- 控制字符需要显式排除
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/

function sanitizeName(value: string): string {
  // 逐字符过滤，避免为非全局正则引入 replaceAll 的兼容性问题。
  const cleaned = [...value].filter((char) => !CONTROL_CHAR.test(char)).join('')
  return cleaned.trim().slice(0, 128)
}

function looksLikeServer(value: Record<string, unknown>): boolean {
  const command = value.command
  if (typeof command === 'string' && command.trim()) return true
  if (Array.isArray(command) && typeof command[0] === 'string' && command[0].trim()) return true
  return URL_KEYS.some((key) => typeof value[key] === 'string' && (value[key] as string).trim())
}

/**
 * 由包名或域名推导一个可用的 server 名称。
 *
 * 单条 server 对象没有配置键，直接落成空名会让用户卡在必填校验上；
 * 这里优先用 `@scope/server-x` 这类包名，其次用域名首段。
 */
function inferName(raw: Record<string, unknown>): string {
  const explicit = stringField(raw, ['name', 'serverName', 'id'])
  if (explicit) return sanitizeName(explicit)

  const command = raw.command
  const argv = Array.isArray(command)
    ? command.filter((entry): entry is string => typeof entry === 'string').slice(1)
    : stringArray(raw.args)

  const packageSpec = argv.find(
    (entry) =>
      !entry.startsWith('-') &&
      /^[@\w]/.test(entry) &&
      !entry.includes('://') &&
      !entry.startsWith('.') &&
      !entry.startsWith('/'),
  )
  const fromPackage = packageSpec ? nameFromPackage(packageSpec) : undefined
  if (fromPackage) return fromPackage

  const url = stringField(raw, URL_KEYS)
  if (url) {
    try {
      const labels = new URL(url).hostname.split('.').filter(Boolean)
      // 去掉最后一段（顶级域），再从剩下的标签里挑第一个有意义的。
      const candidates = labels.length > 1 ? labels.slice(0, -1) : labels
      const label = candidates.find((part) => part.length > 1 && !HOST_PREFIXES.has(part))
      if (label) return sanitizeName(label)
    } catch {
      /* 非法 URL 交给后续校验报错 */
    }
  }
  return 'mcp-server'
}

/** `@modelcontextprotocol/server-filesystem@2.1.0` → `filesystem`。 */
function nameFromPackage(spec: string): string | undefined {
  const withoutVersion = spec.replace(/@[^/@]*$/, '')
  const segment = withoutVersion.split('/').at(-1)
  if (!segment) return undefined
  let name = segment
  for (const prefix of NAME_PREFIXES) {
    if (name.startsWith(prefix) && name.length - prefix.length >= 3) {
      name = name.slice(prefix.length)
      break
    }
  }
  const sanitized = sanitizeName(name.replace(/[^A-Za-z0-9._-]/g, '-'))
  return sanitized.length > 0 ? sanitized : undefined
}

/** 由 env / header 名派生合法的环境变量名。 */
function deriveEnvName(key: string): string | undefined {
  const derived = key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
  const normalized = /^[0-9]/.test(derived) ? `_${derived}` : derived
  return isValidMcpEnvName(normalized) ? normalized : undefined
}

/** 解析环境变量占位符；不是占位符时返回 undefined。 */
function placeholderName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  for (const pattern of ENV_PLACEHOLDERS) {
    const match = pattern.exec(text)
    if (match) return match[1]
  }
  return undefined
}

function isContainerLike(value: Record<string, unknown>): boolean {
  return (
    isRecord(value.projects) ||
    isRecord(value.mcp) ||
    SERVER_CONTAINER_KEYS.some((key) => isRecord(value[key]))
  )
}

function addContainer(
  container: Record<string, unknown>,
  target: CollectedServer[],
  projectRoot: string | undefined,
  depth: number,
): void {
  for (const [key, raw] of Object.entries(container)) {
    if (!isRecord(raw)) continue
    const name = sanitizeName(key)
    if (!name) continue
    if (looksLikeServer(raw)) {
      target.push({ serverName: name, raw, ...(projectRoot ? { projectRoot } : {}) })
      continue
    }
    // 少数客户端会在 `mcpServers` 里再嵌一层 `{ servers: ... }`，继续向下找；
    // 其余形状无法识别的条目原样收下，由构建阶段产出 `unrecognized-server` 告警。
    if (isContainerLike(raw)) {
      collectServers(raw, target, projectRoot, depth + 1)
      continue
    }
    target.push({ serverName: name, raw, ...(projectRoot ? { projectRoot } : {}) })
  }
}

/**
 * 从任意层级收集 server 条目。
 *
 * 递归只在明确的容器形态上展开；`projects` 分组会带上项目根目录，
 * 供 UI 预选 local scope 写入目标。
 */
function collectServers(
  value: unknown,
  target: CollectedServer[],
  projectRoot?: string,
  depth = 0,
): void {
  if (depth > MAX_DEPTH) return
  if (Array.isArray(value)) {
    for (const entry of value) collectServers(entry, target, projectRoot, depth + 1)
    return
  }
  if (!isRecord(value)) return

  if (isRecord(value.projects)) {
    for (const [root, project] of Object.entries(value.projects)) {
      if (isRecord(project)) collectServers(project, target, root, depth + 1)
    }
  }

  for (const key of SERVER_CONTAINER_KEYS) {
    const container = value[key]
    if (isRecord(container)) addContainer(container, target, projectRoot, depth)
  }

  // OpenCode：`mcp` 既是 server 映射，也可能是 `mcp.servers` 容器。
  const nested = value.mcp
  if (isRecord(nested)) {
    if (isRecord(nested.servers)) addContainer(nested.servers, target, projectRoot, depth)
    else addContainer(nested, target, projectRoot, depth)
  }
}

/**
 * 移除参数里的明文凭据。
 *
 * 与 `normalize` 的脱敏启发式同源：只认 flag（`-x` / `--xx`）或 `KEY=VALUE`，
 * 裸参数（如包名）和布尔开关不算凭据。移除而不是脱敏，是因为
 * `validateMcpDefinition` 会直接拒绝带占位符或明文凭据的参数。
 */
function stripSensitiveArgs(args: readonly string[]): { args: string[]; removed: string[] } {
  const kept: string[] = []
  const removed: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    const equalIndex = argument.indexOf('=')
    const flag = equalIndex >= 0 ? argument.slice(0, equalIndex) : argument
    const prefixed = flag.startsWith('-') || equalIndex >= 0
    if (!prefixed || !SENSITIVE_MCP_ARGUMENT.test(flag)) {
      kept.push(argument)
      continue
    }
    if (equalIndex >= 0) {
      // `--token=` 这类空值保留为布尔开关，避免误删。
      if (argument.length > equalIndex + 1) removed.push(flag)
      else kept.push(argument)
      continue
    }
    const next = args[index + 1]
    if (next === undefined || next.startsWith('-')) {
      kept.push(argument)
      continue
    }
    removed.push(flag)
    index += 1
  }
  return { args: kept, removed }
}

function transportKind(
  declared: string | undefined,
  url: string,
  hasCommand: boolean,
): McpServerDefinition['transport']['kind'] {
  if (hasCommand) return 'stdio'
  const type = declared?.toLowerCase().replaceAll('_', '-')
  if (type === 'sse') return 'sse'
  if (type === 'ws' || type === 'websocket') return 'websocket'
  if (type === 'local') return 'stdio'
  if (type) return 'streamable-http'
  try {
    return /\/sse\/?$/.test(new URL(url).pathname) ? 'sse' : 'streamable-http'
  } catch {
    return 'streamable-http'
  }
}

/** 把一个原生 server 条目转换成平台中立定义；无法识别时返回 null。 */
function buildDefinition(
  item: CollectedServer,
  options: McpImportOptions,
  warnings: McpImportWarning[],
): McpServerDefinition | null {
  const raw = item.raw
  const serverName = item.serverName
  const secrets = new Set<string>(
    (options.extraSecrets ?? []).filter((name) => isValidMcpEnvName(name)),
  )
  const push = (code: McpImportWarningCode, detail?: string): void => {
    warnings.push({ code, serverName, ...(detail === undefined ? {} : { detail }) })
  }

  const ignored = Object.keys(raw).filter((key) => !IMPORTED_KEYS.has(key))
  if (ignored.length > 0) push('ignored-field', ignored.join(', '))

  const description = stringField(raw, ['description']) ?? options.description?.trim()
  const shared = {
    name: serverName,
    ...(description ? { description } : {}),
  }

  /** 占位符沿用变量名；明文 env 保留合法原名，Header 派生环境变量名。 */
  const referenceFor = (
    key: string,
    value: unknown,
    field: 'env' | 'header',
  ): McpValueRef | undefined => {
    const placeholder = placeholderName(value)
    if (placeholder) {
      secrets.add(placeholder)
      return { kind: 'env', name: placeholder }
    }
    const derived = field === 'env' && isValidMcpEnvName(key) ? key : deriveEnvName(key)
    if (!derived) {
      push('ignored-field', key)
      return undefined
    }
    secrets.add(derived)
    push('literal-discarded', key)
    return { kind: 'env', name: derived }
  }

  const commandValue = raw.command
  const argv = typeof commandValue === 'string' ? [commandValue] : stringArray(commandValue)
  const command = argv[0]?.trim()
  const url = stringField(raw, URL_KEYS)

  if (!command && !url) return null

  const declared = stringField(raw, ['type', 'transport'])
  const kind = transportKind(declared, url ?? '', Boolean(command))

  if (kind === 'stdio') {
    if (!command) return null
    const rawEnv = isRecord(raw.env)
      ? raw.env
      : isRecord(raw.environment)
        ? raw.environment
        : {}
    const env: Record<string, McpValueRef> = {}
    for (const [key, value] of Object.entries(rawEnv)) {
      const reference = referenceFor(key, value, 'env')
      if (reference) env[key] = reference
    }
    // Codex：`env_vars = ["A", "B"]` 只声明变量名。
    for (const name of stringArray(raw.env_vars)) {
      if (!isValidMcpEnvName(name)) continue
      env[name] = { kind: 'env', name }
      secrets.add(name)
    }

    const rawArgs = Array.isArray(commandValue)
      ? stringArray(commandValue).slice(1)
      : stringArray(raw.args)
    const { args, removed } = stripSensitiveArgs(rawArgs)
    for (const flag of removed) push('arg-secret-removed', flag)

    const cwd = stringField(raw, ['cwd'])
    return {
      ...shared,
      transport: { kind: 'stdio', command, args, ...(cwd ? { cwd } : {}), env },
      requiredSecrets: [...secrets].sort(),
    }
  }

  const headers: Record<string, McpValueRef> = {}
  // 走到这里说明没有 command，URL 必然存在（前面已拦截两者都缺省的条目）。
  if (!url) return null
  const rawHeaders = isRecord(raw.headers)
    ? raw.headers
    : isRecord(raw.http_headers)
      ? raw.http_headers
      : {}
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (!key || CONTROL_CHAR.test(key)) continue
    const reference = referenceFor(key, value, 'header')
    if (reference) headers[key] = reference
  }
  // Codex：`env_http_headers = { Header = "ENV_NAME" }`。
  if (isRecord(raw.env_http_headers)) {
    for (const [header, name] of Object.entries(raw.env_http_headers)) {
      if (typeof name !== 'string' || !isValidMcpEnvName(name)) continue
      headers[header] = { kind: 'env', name }
      secrets.add(name)
    }
  }

  return {
    ...shared,
    transport: { kind, url, headers },
    requiredSecrets: [...secrets].sort(),
  }
}

function entryLabel(definition: McpServerDefinition): string {
  return definition.transport.kind === 'stdio'
    ? [definition.transport.command, ...definition.transport.args].join(' ')
    : definition.transport.url
}

/** 对象键排序、数组保持顺序，用于比较完整定义而不受字段声明顺序影响。 */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  )
}

/** 把收集到的条目统一构建成候选，只合并同一项目下完全相同的定义。 */
function buildCandidates(
  collected: readonly CollectedServer[],
  options: McpImportOptions,
): McpImportResult {
  const candidates: McpImportCandidate[] = []
  const warnings: McpImportWarning[] = []
  const seen = new Set<string>()

  for (const item of collected) {
    const definition = buildDefinition(item, options, warnings)
    if (!definition) {
      warnings.push({ code: 'unrecognized-server', detail: item.serverName })
      continue
    }
    const label = entryLabel(definition)
    const key = JSON.stringify(canonicalValue({ definition, projectRoot: item.projectRoot }))
    if (seen.has(key)) {
      warnings.push({ code: 'duplicate-entry', serverName: definition.name, detail: definition.name })
      continue
    }
    seen.add(key)
    candidates.push({
      serverName: definition.name,
      label,
      definition,
      ...(item.projectRoot ? { projectRoot: item.projectRoot } : {}),
    })
  }

  return { candidates, warnings }
}

/**
 * 从市场详情返回的配置数组里提取全部可安装候选。
 *
 * 与 {@link parseMcpServerConfig} 共用同一套字段归一规则，避免市场安装与手工导入
 * 对同一份配置得出不同结果。
 */
export function extractMcpCandidates(
  configs: readonly unknown[],
  options: McpImportOptions = {},
): McpImportCandidate[] {
  const collected: CollectedServer[] = []
  for (const config of configs) collectServers(config, collected)
  return buildCandidates(collected, options).candidates
}

/**
 * 解析用户粘贴的 MCP 配置 JSON，返回候选列表与告警。
 *
 * @throws {McpImportError} 输入为空、JSON 语法错误或找不到任何可用 server 时抛出。
 */
export function parseMcpServerConfig(
  text: string,
  options: McpImportOptions = {},
): McpImportResult {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new McpImportError('MCP_IMPORT_EMPTY', '请先粘贴 MCP 配置 JSON')
  }

  const errors: ParseError[] = []
  const value = parse(trimmed, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false,
  }) as unknown
  if (errors.length > 0) {
    const first = errors[0]!
    const position = positionOf(trimmed, first.offset)
    throw new McpImportError(
      'MCP_IMPORT_PARSE_FAILED',
      `JSON 解析失败（第 ${position.line} 行第 ${position.column} 列）：${printParseErrorCode(first.error)}`,
      { position },
    )
  }

  const collected: CollectedServer[] = []
  collectServers(value, collected)
  // 单条 server 对象（没有配置键）单独兜底，名称由包名或域名推导。
  if (collected.length === 0 && isRecord(value) && looksLikeServer(value)) {
    collected.push({ serverName: inferName(value), raw: value })
  }
  if (collected.length === 0) {
    throw new McpImportError(
      'MCP_IMPORT_NO_SERVERS',
      '没有在 JSON 中找到可导入的 MCP Server（需要 command 或 url）',
    )
  }

  const result = buildCandidates(collected, options)
  if (result.candidates.length === 0) {
    throw new McpImportError(
      'MCP_IMPORT_NO_SERVERS',
      '没有在 JSON 中找到可导入的 MCP Server（需要 command 或 url）',
    )
  }
  return result
}
