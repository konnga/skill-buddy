import type { McpServerDefinition, McpValueRef } from '@skillbuddy/core'
import type {
  McpSoCard,
  McpSoDetail,
  ModelScopeMcpDetail,
  ModelScopeMcpSummary,
} from '../../../shared/ipc.js'

export type McpMarketSourceId = 'modelscope' | 'mcp-so'

/** 统一后的 MCP 市场列表项（两个数据源共用一套 UI）。 */
export interface McpMarketItem {
  key: string
  source: McpMarketSourceId
  /** modelscope: 服务 id（@org/name）；mcp.so: 页面 slug */
  id: string
  name: string
  description: string
  /** 作者 / 发布者，显示在标题下方 */
  author: string
  icon: string | null
  tags: string[]
  /** 魔搭访问量；mcp.so 无此数据 */
  viewCount: number | null
  /** 魔搭可选统计；接口未返回时保持 null，不使用伪造数据。 */
  usageCount: number | null
  downloadCount: number | null
  favoriteCount: number | null
  /** 市场详情页链接 */
  link: string
}

/** 详情解析出的一个可安装候选：配置里的一个 mcpServers 条目。 */
export interface McpMarketCandidate {
  /** 配置键名，作为安装后的 server 名称 */
  serverName: string
  /** 供 UI 区分多个候选：命令行或远程 URL 摘要 */
  label: string
  definition: McpServerDefinition
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 魔搭列表项 → 统一市场条目；中文环境优先展示中文名。 */
export function mapModelScopeItem(raw: ModelScopeMcpSummary, preferChinese: boolean): McpMarketItem {
  return {
    key: `modelscope:${raw.id}`,
    source: 'modelscope',
    id: raw.id,
    name: (preferChinese ? raw.chineseName || raw.name : raw.englishName || raw.name) || raw.id,
    description: preferChinese ? raw.description : raw.englishDescription || raw.description,
    author: raw.publisher || raw.id.split('/')[0] || '',
    icon: raw.iconUrl,
    tags: raw.categories.length > 0 ? raw.categories : raw.tags,
    viewCount: raw.viewCount,
    usageCount: raw.usageCount ?? null,
    downloadCount: raw.downloadCount ?? null,
    favoriteCount: raw.favoriteCount ?? null,
    link: `https://modelscope.cn/mcp/servers/${raw.id}`,
  }
}

/** mcp.so 搜索卡片 → 统一市场条目。 */
export function mapMcpSoItem(raw: McpSoCard): McpMarketItem {
  return {
    key: `mcp-so:${raw.slug}`,
    source: 'mcp-so',
    id: raw.slug,
    name: raw.name,
    description: raw.description,
    author: raw.author,
    icon: raw.iconUrl,
    tags: [],
    viewCount: null,
    usageCount: null,
    downloadCount: null,
    favoriteCount: null,
    link: `https://mcp.so/servers/${raw.slug}`,
  }
}

/**
 * 把市场配置里的 env 键转换为环境变量引用。
 * 完整环境变量占位符沿用其变量名；示例明文和普通固定值一律丢弃，改为同名引用，
 * 既满足 validateMcpDefinition 拒绝明文字面量的要求，也避免跨来源复制本机配置值。
 */
function toEnvRefs(value: unknown): { refs: Record<string, McpValueRef>; names: string[] } {
  const refs: Record<string, McpValueRef> = {}
  const names = new Set<string>()
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, raw] of Object.entries(value)) {
      if (!ENV_NAME_RE.test(key)) continue
      const placeholder =
        typeof raw === 'string'
          ? /^(?:\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\{env:([A-Za-z_][A-Za-z0-9_]*)\})$/.exec(
              raw.trim(),
            )
          : null
      const environmentName = placeholder?.[1] ?? placeholder?.[2] ?? key
      refs[key] = { kind: 'env', name: environmentName }
      names.add(environmentName)
    }
  }
  return { refs, names: [...names] }
}

/**
 * 把远程配置的 Header 转为环境变量引用。
 * 只有值本身是完整环境变量占位符时才沿用该变量名；带 Bearer 前缀或示例明文的值
 * 无法由平台中立模型安全表达，因此改用 Header 名派生变量，用户需提供完整 Header 值。
 */
function headersToEnvRefs(value: unknown): { refs: Record<string, McpValueRef>; names: string[] } {
  const refs: Record<string, McpValueRef> = {}
  const names = new Set<string>()
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { refs, names: [] }
  }

  for (const [header, raw] of Object.entries(value)) {
    if (!header || /[\u0000-\u001f\u007f]/.test(header)) continue
    const placeholder =
      typeof raw === 'string'
        ? /^(?:\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\{env:([A-Za-z_][A-Za-z0-9_]*)\})$/.exec(
            raw.trim(),
          )
        : null
    const derived = header.replaceAll(/[^A-Za-z0-9_]/g, '_').toUpperCase()
    const environmentName = placeholder?.[1] ?? placeholder?.[2] ?? derived
    if (!ENV_NAME_RE.test(environmentName)) continue
    refs[header] = { kind: 'env', name: environmentName }
    names.add(environmentName)
  }

  return { refs, names: [...names] }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** 由原始配置条目构造平台中立定义；无法识别的形状返回 null。 */
function rawToDefinition(
  serverName: string,
  raw: unknown,
  description: string,
  extraSecrets: string[],
): McpServerDefinition | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const entry = raw as Record<string, unknown>
  const secrets = new Set(extraSecrets.filter((name) => ENV_NAME_RE.test(name)))

  if (typeof entry.command === 'string' && entry.command.trim()) {
    const { refs, names } = toEnvRefs(entry.env)
    for (const name of names) secrets.add(name)
    return {
      name: serverName,
      ...(description ? { description } : {}),
      transport: {
        kind: 'stdio',
        command: entry.command,
        args: asStringArray(entry.args),
        ...(typeof entry.cwd === 'string' && entry.cwd ? { cwd: entry.cwd } : {}),
        env: refs,
      },
      requiredSecrets: [...secrets].sort(),
    }
  }

  const remoteUrl =
    typeof entry.url === 'string' && entry.url.trim()
      ? entry.url.trim()
      : typeof entry.baseUrl === 'string' && entry.baseUrl.trim()
        ? entry.baseUrl.trim()
        : null
  if (remoteUrl) {
    const { refs, names } = headersToEnvRefs(entry.headers)
    for (const name of names) secrets.add(name)
    const declared = typeof entry.type === 'string' ? entry.type.toLowerCase() : ''
    const kind = declared === 'sse' || (!declared && /\/sse\/?$/.test(new URL(remoteUrl).pathname))
      ? 'sse'
      : declared === 'websocket' || declared === 'ws'
        ? 'websocket'
        : 'streamable-http'
    return {
      name: serverName,
      ...(description ? { description } : {}),
      transport: { kind, url: remoteUrl, headers: refs },
      requiredSecrets: [...secrets].sort(),
    }
  }

  return null
}

/**
 * 从详情返回的配置对象数组中提取全部可安装候选。
 * 每个配置对象形如 { mcpServers: { name: {...} } }，可能含多个安装方式（uvx / docker / 远程）。
 */
export function extractCandidates(
  configs: unknown[],
  description: string,
  extraSecrets: string[] = [],
): McpMarketCandidate[] {
  const candidates: McpMarketCandidate[] = []
  const seen = new Set<string>()
  for (const config of configs) {
    if (typeof config !== 'object' || config === null) continue
    const servers = (config as { mcpServers?: unknown }).mcpServers
    if (typeof servers !== 'object' || servers === null) continue
    for (const [serverName, raw] of Object.entries(servers as Record<string, unknown>)) {
      if (!serverName.trim() || serverName.length > 128) continue
      let definition: McpServerDefinition | null = null
      try {
        definition = rawToDefinition(serverName, raw, description, extraSecrets)
      } catch {
        continue
      }
      if (!definition) continue
      const label =
        definition.transport.kind === 'stdio'
          ? [definition.transport.command, ...definition.transport.args].join(' ')
          : definition.transport.url
      const key = `${serverName}\u0000${label}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({ serverName, label, definition })
    }
  }
  return candidates
}

/** 详情 → 候选列表（魔搭：env_schema 的必填项并入 requiredSecrets）。 */
export function candidatesFromModelScope(
  detail: ModelScopeMcpDetail,
  preferChinese = true,
): McpMarketCandidate[] {
  const description = preferChinese
    ? detail.description
    : detail.englishDescription || detail.description
  return extractCandidates(detail.configs, description, detail.requiredEnv)
}

/** 详情 → 候选列表（mcp.so）。 */
export function candidatesFromMcpSo(detail: McpSoDetail, fallbackDescription: string): McpMarketCandidate[] {
  return extractCandidates(detail.configs, detail.description || fallbackDescription)
}
