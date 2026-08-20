import { onMounted, shallowRef, watch } from 'vue'
import type { MarketItem, MarketSourceId } from '@/lib/market'
import {
  cachedSkillMarketRequest,
  readSkillMarketCatalogCache,
  skillMarketCacheKey,
  writeSkillMarketCatalogCache,
} from '@/lib/skill-market-cache'

const DEFAULT_QUERY = 'ai'
const PAGE_SIZE = 24

function mapSkillsSh(
  list: Awaited<ReturnType<typeof window.skillsManager.marketSearch>>,
): MarketItem[] {
  return list.map((skill) => ({
    key: `sksh:${skill.id}`,
    kind: 'skills-sh' as const,
    name: skill.name,
    description: '',
    installs: skill.installs,
    stars: null,
    icon: `https://github.com/${skill.source.split('/')[0]}.png?size=96`,
    sourceLabel: skill.source,
    link: `https://github.com/${skill.source}`,
    repo: skill.source,
    skillId: skill.skillId,
  }))
}

function mapSkillhub(
  list: Awaited<ReturnType<typeof window.skillsManager.skillhubSearch>>['items'],
): MarketItem[] {
  return list.map((skill) => ({
    key: `hub:${skill.namespace}/${skill.slug}`,
    kind: 'skillhub' as const,
    name: skill.name,
    description: skill.description,
    installs: skill.installs,
    stars: skill.stars,
    icon: skill.iconUrl,
    sourceLabel: skill.canonicalName,
    link:
      skill.upstreamUrl ??
      `https://skillhub.cn/skills/${encodeURIComponent(skill.namespace)}/${encodeURIComponent(skill.slug)}`,
    slug: skill.slug,
    namespace: skill.namespace,
    version: skill.version,
    updatedAt: skill.updatedAt,
    verified: skill.verified,
    requiresApiKey: skill.requiresApiKey,
    tags: skill.tags,
  }))
}

function mapGithub(
  list: Awaited<ReturnType<typeof window.skillsManager.githubSearch>>['items'],
): MarketItem[] {
  return list.map((repository) => ({
    key: `github:${repository.fullName}`,
    kind: 'github' as const,
    name: repository.name,
    description: repository.description,
    installs: 0,
    stars: repository.stars,
    icon: repository.avatarUrl,
    sourceLabel: repository.fullName,
    link: repository.htmlUrl,
    repo: repository.fullName,
  }))
}

export function useSkillMarketDiscovery() {
  const cachedCatalog = readSkillMarketCatalogCache()
  const source = shallowRef<MarketSourceId>(cachedCatalog?.source ?? 'skills-sh')
  const query = shallowRef(cachedCatalog?.query ?? '')
  const items = shallowRef<MarketItem[]>(cachedCatalog?.items ?? [])
  const loading = shallowRef(false)
  const loadingMore = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const hasMore = shallowRef(cachedCatalog?.hasMore ?? false)

  /** skills.sh 不提供分页，保留完整结果并在渲染层分批追加。 */
  let skillsShItems = cachedCatalog?.skillsShItems ?? []
  let skillhubPage = cachedCatalog?.skillhubPage ?? 1
  let skillhubTotal = cachedCatalog?.skillhubTotal ?? 0
  let githubPage = cachedCatalog?.githubPage ?? 1
  let githubTotal = cachedCatalog?.githubTotal ?? 0
  let activeQuery = cachedCatalog?.query.trim() ?? ''
  let searchRequestId = 0

  function cacheCatalog(): void {
    writeSkillMarketCatalogCache({
      source: source.value,
      query: activeQuery,
      items: items.value,
      skillsShItems,
      skillhubPage,
      skillhubTotal,
      githubPage,
      githubTotal,
      hasMore: hasMore.value,
    })
  }

  /** GitHub 星标是补充请求，只允许更新发起它的同一轮 skills.sh 搜索。 */
  async function fillStars(batch: MarketItem[], requestId: number): Promise<void> {
    const repositories = [...new Set(batch.map((item) => item.repo).filter(Boolean))] as string[]
    if (repositories.length === 0) return
    try {
      const stars = await window.skillsManager.githubStars(repositories)
      if (requestId !== searchRequestId || source.value !== 'skills-sh') return
      items.value = items.value.map((item) =>
        item.kind === 'skills-sh' && item.repo && stars[item.repo] !== undefined
          ? { ...item, stars: stars[item.repo]! }
          : item,
      )
      cacheCatalog()
    } catch {
      /** 星标加载失败不影响市场基础列表。 */
    }
  }

  async function search(): Promise<void> {
    const requestId = ++searchRequestId
    const requestedSource = source.value
    const requestedQuery = query.value.trim()
    activeQuery = requestedQuery
    loading.value = true
    loadingMore.value = false
    error.value = null
    items.value = []
    hasMore.value = false
    try {
      if (requestedSource === 'skills-sh') {
        const term = requestedQuery || DEFAULT_QUERY
        const result = await cachedSkillMarketRequest(
          skillMarketCacheKey('skills-sh-search', term),
          () => window.skillsManager.marketSearch(term),
        )
        if (requestId !== searchRequestId) return
        skillsShItems = mapSkillsSh(result)
        const firstPage = skillsShItems.slice(0, PAGE_SIZE)
        items.value = firstPage
        hasMore.value = skillsShItems.length > firstPage.length
        cacheCatalog()
        void fillStars(firstPage, requestId)
        return
      }

      if (requestedSource === 'skillhub') {
        const result = await cachedSkillMarketRequest(
          skillMarketCacheKey('skillhub-search', requestedQuery, 1),
          () => window.skillsManager.skillhubSearch(requestedQuery, 1),
        )
        if (requestId !== searchRequestId) return
        skillhubPage = 1
        skillhubTotal = result.total
        items.value = mapSkillhub(result.items)
        hasMore.value = items.value.length < skillhubTotal
        cacheCatalog()
        return
      }

      if (!requestedQuery) {
        githubPage = 1
        githubTotal = 0
        cacheCatalog()
        return
      }
      const result = await cachedSkillMarketRequest(
        skillMarketCacheKey('github-search', requestedQuery, 1),
        () => window.skillsManager.githubSearch(requestedQuery, 1),
      )
      if (requestId !== searchRequestId) return
      githubPage = 1
      githubTotal = result.total
      items.value = mapGithub(result.items)
      hasMore.value = items.value.length < githubTotal
      cacheCatalog()
    } catch (cause) {
      if (requestId !== searchRequestId) return
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (requestId === searchRequestId) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (loading.value || loadingMore.value || !hasMore.value) return
    const requestId = searchRequestId
    const requestedSource = source.value
    /** 始终沿用最后一次已提交的查询，避免输入中的草稿与旧分页结果混合。 */
    const requestedQuery = activeQuery
    loadingMore.value = true
    try {
      if (requestedSource === 'skills-sh') {
        const nextItems = skillsShItems.slice(items.value.length, items.value.length + PAGE_SIZE)
        items.value = [...items.value, ...nextItems]
        hasMore.value = skillsShItems.length > items.value.length
        cacheCatalog()
        void fillStars(nextItems, requestId)
        return
      }

      if (requestedSource === 'skillhub') {
        const nextPage = skillhubPage + 1
        const result = await cachedSkillMarketRequest(
          skillMarketCacheKey('skillhub-search', requestedQuery, nextPage),
          () => window.skillsManager.skillhubSearch(requestedQuery, nextPage),
        )
        if (requestId !== searchRequestId) return
        skillhubPage = nextPage
        skillhubTotal = result.total
        const knownKeys = new Set(items.value.map((item) => item.key))
        items.value = [
          ...items.value,
          ...mapSkillhub(result.items).filter((item) => !knownKeys.has(item.key)),
        ]
        hasMore.value = result.items.length > 0 && items.value.length < skillhubTotal
        cacheCatalog()
        return
      }

      const nextPage = githubPage + 1
      const result = await cachedSkillMarketRequest(
        skillMarketCacheKey('github-search', requestedQuery, nextPage),
        () => window.skillsManager.githubSearch(requestedQuery, nextPage),
      )
      if (requestId !== searchRequestId) return
      githubPage = nextPage
      githubTotal = result.total
      const knownKeys = new Set(items.value.map((item) => item.key))
      items.value = [
        ...items.value,
        ...mapGithub(result.items).filter((item) => !knownKeys.has(item.key)),
      ]
      hasMore.value = result.items.length > 0 && items.value.length < githubTotal
      cacheCatalog()
    } catch (cause) {
      if (requestId !== searchRequestId) return
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (requestId === searchRequestId) loadingMore.value = false
    }
  }

  function setSource(value: MarketSourceId): void {
    source.value = value
  }

  function setQuery(value: string): void {
    query.value = value
  }

  watch(source, () => void search())

  onMounted(() => {
    if (!cachedCatalog) void search()
  })

  return {
    source,
    query,
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    setSource,
    setQuery,
    search,
    loadMore,
  }
}
