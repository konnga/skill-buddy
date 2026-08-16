import type { MarketItem, MarketSourceId } from './market'

const SKILL_MARKET_CACHE_TTL = 10 * 60_000
const SKILL_MARKET_CACHE_MAX_ENTRIES = 200

interface SkillMarketCacheEntry {
  value: unknown
  expiresAt: number
}

export interface SkillMarketCatalogCache {
  source: MarketSourceId
  query: string
  items: MarketItem[]
  skillsShItems: MarketItem[]
  skillhubPage: number
  skillhubTotal: number
  githubPage: number
  githubTotal: number
  hasMore: boolean
}

const cache = new Map<string, SkillMarketCacheEntry>()
const pendingRequests = new Map<string, Promise<unknown>>()
const CATALOG_CACHE_KEY = 'catalog-state'

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }

  while (cache.size >= SKILL_MARKET_CACHE_MAX_ENTRIES) {
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
  cache.set(key, { value, expiresAt: now + SKILL_MARKET_CACHE_TTL })
}

/** 生成不会受搜索词分隔符影响的 Skills 市场缓存键。 */
export function skillMarketCacheKey(...parts: readonly (number | string)[]): string {
  return JSON.stringify(parts)
}

/** 返回 10 分钟内的 Skills 市场请求结果，并合并相同的并发请求。 */
export async function cachedSkillMarketRequest<T>(
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

/** 读取 10 分钟内最近一次 Skills 市场列表状态。 */
export function readSkillMarketCatalogCache(): SkillMarketCatalogCache | undefined {
  return readCache<SkillMarketCatalogCache>(CATALOG_CACHE_KEY)
}

/** 缓存 Skills 市场当前数据源、搜索词、分页和列表状态。 */
export function writeSkillMarketCatalogCache(value: SkillMarketCatalogCache): void {
  writeCache(CATALOG_CACHE_KEY, {
    ...value,
    items: [...value.items],
    skillsShItems: [...value.skillsShItems],
  })
}
