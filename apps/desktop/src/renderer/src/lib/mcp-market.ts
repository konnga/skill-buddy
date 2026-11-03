import { extractMcpCandidates, type McpImportCandidate } from '@skillbuddy/core/mcp-config'
import type {
  McpSoCard,
  McpSoDetail,
  ModelScopeMcpDetail,
  ModelScopeMcpSummary,
} from '#shared/ipc'

export type McpMarketSourceId = 'modelscope' | 'mcp-so'

export const MODELSCOPE_CATEGORY_KEYS = [
  'browser-automation',
  'search',
  'communication',
  'developer-tools',
  'entertainment-and-media',
  'file-systems',
  'finance',
  'knowledge-and-memory',
  'location-services',
  'art-and-culture',
  'research-and-data',
  'calendar-management',
  'other',
] as const

export const MCP_SO_CATEGORY_KEYS = [
  'ai-agents',
  'reasoning',
  'memory-knowledge',
  'search',
  'browser-automation',
  'data-analytics',
  'developer-tools',
  'version-control',
  'productivity',
  'databases',
  'cloud-infra',
  'files-storage',
  'communication',
  'media-design',
  'finance-commerce',
  'other',
] as const

export interface McpMarketCategory {
  value: string
  count: number
}

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
export type McpMarketCandidate = McpImportCandidate

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
    tags: raw.category ? [raw.category] : [],
    viewCount: null,
    usageCount: null,
    downloadCount: null,
    favoriteCount: null,
    link: `https://mcp.so/servers/${raw.slug}`,
  }
}

/**
 * 从市场详情返回的配置对象数组中提取全部可安装候选。
 *
 * 字段归一规则与手工导入共用 `@skillbuddy/core` 的 `extractMcpCandidates`，
 * 避免两条路径对同一份配置得出不同结果；每个配置对象形如
 * `{ mcpServers: { name: {...} } }`，可能含多个安装方式（uvx / docker / 远程）。
 */
export function extractCandidates(
  configs: unknown[],
  description: string,
  extraSecrets: string[] = [],
): McpMarketCandidate[] {
  return extractMcpCandidates(configs, { description, extraSecrets })
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
