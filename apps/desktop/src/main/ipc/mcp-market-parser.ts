import type {
  McpSoCard,
  ModelScopeMcpDetail,
  ModelScopeMcpSummary,
} from '../../shared/ipc.js'

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function firstNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** 解析魔搭 MCP 详情页内嵌的统计数据。网页端字段比公开 OpenAPI 更完整。 */
export function parseModelScopeWebStats(html: string): {
  usageCount?: number
  favoriteCount?: number
  viewCount?: number
} {
  const match = /window\.__detail_data__\s*=\s*("(?:\\.|[^"\\])*");/.exec(html)
  if (!match) return {}
  try {
    const payload = JSON.parse(match[1]) as unknown
    if (typeof payload !== 'string') return {}
    const data = recordValue(JSON.parse(payload))
    if (!data) return {}
    const usageCount = firstNumber(data, ['CallVolume', 'call_volume', 'usage_count'])
    const favoriteCount = firstNumber(data, ['Stars', 'stars', 'favorite_count'])
    const viewCount = firstNumber(data, ['ViewCount', 'view_count'])
    return {
      ...(usageCount !== undefined ? { usageCount } : {}),
      ...(favoriteCount !== undefined ? { favoriteCount } : {}),
      ...(viewCount !== undefined ? { viewCount } : {}),
    }
  } catch {
    return {}
  }
}

/** 将魔搭列表项归一化为稳定的共享 DTO。 */
export function normalizeModelScopeSummary(value: unknown): ModelScopeMcpSummary {
  const raw = recordValue(value) ?? {}
  const english = recordValue(recordValue(raw.locales)?.en) ?? {}
  const id = stringValue(raw.id)
  const usageCount = firstNumber(raw, ['usage_count', 'call_count', 'invoke_count', 'request_count'])
  const downloadCount = firstNumber(raw, ['download_count', 'install_count', 'pull_count'])
  const favoriteCount = firstNumber(raw, ['favorite_count', 'collect_count', 'like_count', 'star_count'])
  return {
    id,
    name: stringValue(raw.name) || id,
    chineseName: stringValue(raw.chinese_name),
    englishName: stringValue(english.name),
    description: stringValue(raw.description),
    englishDescription: stringValue(english.description),
    iconUrl: stringValue(raw.logo_url) || null,
    tags: stringArray(raw.tags),
    categories: stringArray(raw.categories),
    viewCount: numberValue(raw.view_count),
    ...(usageCount !== undefined ? { usageCount } : {}),
    ...(downloadCount !== undefined ? { downloadCount } : {}),
    ...(favoriteCount !== undefined ? { favoriteCount } : {}),
    publisher: stringValue(raw.publisher),
  }
}

/** 校验并归一化魔搭列表响应 data。 */
export function normalizeModelScopeList(value: unknown): {
  items: ModelScopeMcpSummary[]
  total: number
} {
  const data = recordValue(value)
  if (!data || !Array.isArray(data.mcp_server_list)) throw new Error('modelscope response invalid')
  const items = data.mcp_server_list
    .map(normalizeModelScopeSummary)
    .filter((item) => item.id.length > 0)
  return { items, total: numberValue(data.total_count) || items.length }
}

/** 校验并归一化魔搭详情响应 data。 */
export function normalizeModelScopeDetail(value: unknown, fallbackId: string): ModelScopeMcpDetail {
  const raw = recordValue(value)
  if (!raw) throw new Error('modelscope response invalid')
  const summary = normalizeModelScopeSummary(raw)
  if (!summary.id) throw new Error('modelscope response invalid')
  const envSchema = recordValue(raw.env_schema) ?? {}
  return {
    ...summary,
    id: summary.id || fallbackId,
    author: stringValue(raw.author),
    sourceUrl: stringValue(raw.source_url) || null,
    readme: stringValue(raw.readme),
    githubStars: numberValue(raw.github_stars),
    isHosted: raw.is_hosted === true,
    isVerified: raw.is_verified === true,
    requiredEnv: stringArray(envSchema.required),
    configs: Array.isArray(raw.server_config) ? raw.server_config : [],
  }
}

/** 还原页面文本中的常见 HTML 实体。 */
export function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
}

function attributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, 'i').exec(attributes)
  return match?.[2]
}

/** 返回 HTML 中第一个匹配指定协议与主机前缀的链接。 */
export function firstExternalLink(html: string, prefix: string): string | null {
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attributeValue(match[1] ?? '', 'href')
    if (href?.startsWith(prefix)) return decodeHtmlEntities(href)
  }
  return null
}

function plainText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, '')).trim()
}

function textByClasses(chunk: string, tag: string, requiredClasses: string[]): string {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  for (const match of chunk.matchAll(pattern)) {
    const classes = new Set((attributeValue(match[1] ?? '', 'class') ?? '').split(/\s+/))
    if (requiredClasses.every((name) => classes.has(name))) return plainText(match[2] ?? '')
  }
  return ''
}

/** 从 mcp.so 搜索/列表页解析服务器卡片。 */
export function parseMcpSoCards(html: string): McpSoCard[] {
  const cards: McpSoCard[] = []
  const seen = new Set<string>()
  const anchor = /<a\b[^>]*\bhref=(['"])\/servers\/([^'"?#]+)\1[^>]*>/gi
  let match = anchor.exec(html)
  while (match) {
    const slug = match[2]!
    const next = anchor.exec(html)
    const chunk = html.slice(match.index, next?.index ?? Math.min(html.length, match.index + 6_000))
    match = next
    if (seen.has(slug)) continue

    const name = textByClasses(chunk, 'h3', [])
    if (!name) continue
    seen.add(slug)
    const image = /<img\b([^>]*)>/i.exec(chunk)
    const imageUrl = image ? attributeValue(image[1] ?? '', 'src') : undefined
    cards.push({
      slug,
      name,
      author: textByClasses(chunk, 'p', ['truncate', 'text-xs']),
      description: textByClasses(chunk, 'p', ['line-clamp-2']),
      iconUrl: imageUrl?.startsWith('https://') ? decodeHtmlEntities(imageUrl) : null,
    })
  }

  if (cards.length === 0 && /href=(['"])\/servers\//i.test(html)) {
    throw new Error('mcp.so 页面结构已变化，暂时无法解析搜索结果')
  }
  return cards
}

/** 解析详情页中所有 SoftwareApplication 等 LD+JSON 块。 */
export function parseMcpSoLdJson(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    if (attributeValue(match[1] ?? '', 'type')?.toLowerCase() !== 'application/ld+json') continue
    try {
      const parsed = JSON.parse(match[2] ?? '') as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        blocks.push(parsed as Record<string, unknown>)
      }
    } catch {
      // 单个块解析失败不影响其余块
    }
  }
  return blocks
}

/** 提取详情页 code 块中包含 mcpServers 的安装配置 JSON。 */
export function parseMcpSoConfigs(html: string): unknown[] {
  const configs: unknown[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)) {
    const text = plainText(match[1] ?? '')
    if (!text.startsWith('{') || !text.includes('"mcpServers"')) continue
    try {
      const parsed = JSON.parse(text) as unknown
      const key = JSON.stringify(parsed)
      if (seen.has(key)) continue
      seen.add(key)
      configs.push(parsed)
    } catch {
      // README 中的示例片段可能不是完整 JSON，忽略
    }
  }
  return configs
}
