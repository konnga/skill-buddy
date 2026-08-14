import type { McpMarketCategory, McpMarketItem, McpMarketSourceId } from './mcp-market'

const MCP_MARKET_CACHE_TTL = 10 * 60_000
const MCP_MARKET_CACHE_MAX_ENTRIES = 200

interface McpMarketCacheEntry {
  value: unknown
  expiresAt: number
}

export interface McpMarketCatalogCache {
  source: McpMarketSourceId
  query: string
  modelScopeCategory: string
  mcpSoCategory: string
  categories: McpMarketCategory[]
  items: McpMarketItem[]
  total: number
  page: number
  preferChinese: boolean
}

const cache = new Map<string, McpMarketCacheEntry>()
const pendingRequests = new Map<string, Promise<unknown>>()
const CATALOG_CACHE_KEY = 'catalog-state'

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }

  while (cache.size >= MCP_MARKET_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey !== 'string') break
    cache.delete(oldestKey)
  }
}

function readCache<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }

  cache.delete(key)
  cache.set(key, entry)
  return entry.value as T
}

function writeCache<T>(key: string, value: T): void {
  const now = Date.now()
  pruneCache(now)
  cache.delete(key)
  cache.set(key, { value, expiresAt: now + MCP_MARKET_CACHE_TTL })
}

/** 生成不会受搜索词分隔符影响的 MCP 市场缓存键。 */
export function mcpMarketCacheKey(...parts: readonly (number | string)[]): string {
  return JSON.stringify(parts)
}

/**
 * 返回 10 分钟内的 MCP 市场请求结果，并合并同一缓存键的并发请求。
 * 请求失败时不写入缓存。
 */
export async function cachedMcpMarketRequest<T>(
  key: string,
  request: () => Promise<T>,
): Promise<T> {
  const cached = readCache<T>(key)
  if (cached !== undefined) return cached

  const pending = pendingRequests.get(key) as Promise<T> | undefined
  if (pending) return pending

  const nextRequest = request()
    .then((value) => {
      writeCache(key, value)
      return value
    })
    .finally(() => pendingRequests.delete(key))
  pendingRequests.set(key, nextRequest)
  return nextRequest
}

/** 读取 10 分钟内的 MCP 市场列表界面状态。 */
export function readMcpMarketCatalogCache(): McpMarketCatalogCache | undefined {
  return readCache<McpMarketCatalogCache>(CATALOG_CACHE_KEY)
}

/** 缓存 MCP 市场列表界面状态 10 分钟。 */
export function writeMcpMarketCatalogCache(value: McpMarketCatalogCache): void {
  writeCache(CATALOG_CACHE_KEY, {
    ...value,
    categories: [...value.categories],
    items: [...value.items],
  })
}
