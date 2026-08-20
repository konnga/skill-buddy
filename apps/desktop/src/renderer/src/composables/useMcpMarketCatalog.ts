import { computed, onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMcpServers } from '@/composables/useMcpServers'
import {
  mapMcpSoItem,
  mapModelScopeItem,
  MCP_SO_CATEGORY_KEYS,
  MODELSCOPE_CATEGORY_KEYS,
  type McpMarketCategory,
  type McpMarketItem,
  type McpMarketSourceId,
} from '@/lib/mcp-market'
import {
  cachedMcpMarketRequest,
  mcpMarketCacheKey,
  readMcpMarketCatalogCache,
  writeMcpMarketCatalogCache,
} from '@/lib/mcp-market-cache'
import type { SelectOption } from '@/components/ui/select'

const ALL_CATEGORIES = 'all'

export function useMcpMarketCatalog() {
  const { t, locale } = useI18n()
  const { refresh, error: mcpError } = useMcpServers()
  const preferChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
  const cachedCatalog = readMcpMarketCatalogCache()
  const initialCatalog =
    cachedCatalog?.preferChinese === preferChinese.value ? cachedCatalog : undefined

  const source = shallowRef<McpMarketSourceId>(initialCatalog?.source ?? 'modelscope')
  const query = shallowRef(initialCatalog?.query ?? '')
  const modelScopeCategory = shallowRef(initialCatalog?.modelScopeCategory || ALL_CATEGORIES)
  const mcpSoCategory = shallowRef(initialCatalog?.mcpSoCategory || ALL_CATEGORIES)
  const category = computed({
    get: () =>
      source.value === 'modelscope' ? modelScopeCategory.value : mcpSoCategory.value,
    set: (value: string) => {
      if (source.value === 'modelscope') modelScopeCategory.value = value
      else mcpSoCategory.value = value
    },
  })
  const categories = shallowRef<McpMarketCategory[]>(initialCatalog?.categories ?? [])
  const items = shallowRef<McpMarketItem[]>(initialCatalog?.items ?? [])
  const total = shallowRef(initialCatalog?.total ?? 0)
  const page = shallowRef(initialCatalog?.page ?? 1)
  const loading = shallowRef(false)
  const loadingMore = shallowRef(false)
  const error = shallowRef<string | null>(null)

  let searchRequestId = 0
  let activeQuery = initialCatalog?.query.trim() ?? ''
  let activeCategory =
    initialCatalog && initialCatalog.source === 'modelscope'
      ? initialCatalog.modelScopeCategory
      : initialCatalog?.mcpSoCategory ?? ALL_CATEGORIES

  const visibleError = computed(() => error.value ?? mcpError.value)
  const categoryOptions = computed<SelectOption[]>(() => {
    const countByValue = new Map(categories.value.map((item) => [item.value, item.count]))
    const categoryKeys: readonly string[] =
      source.value === 'modelscope' ? MODELSCOPE_CATEGORY_KEYS : MCP_SO_CATEGORY_KEYS
    return [
      { value: ALL_CATEGORIES, label: t('mcp.market.allCategories') },
      ...categoryKeys.map((value) => {
        const label = t(`mcp.market.categories.${value}`)
        const count = source.value === 'modelscope' ? countByValue.get(value) : undefined
        return { value, label: count === undefined ? label : `${label} (${count})` }
      }),
    ]
  })
  const canLoadMore = computed(
    () =>
      source.value === 'modelscope' &&
      items.value.length > 0 &&
      items.value.length < total.value,
  )

  async function fetchPage(
    requestedSource: McpMarketSourceId,
    requestedQuery: string,
    requestedCategory: string,
    pageNumber: number,
  ): Promise<{ items: McpMarketItem[]; total: number; categories: McpMarketCategory[] }> {
    if (requestedSource === 'modelscope') {
      const result = await cachedMcpMarketRequest(
        mcpMarketCacheKey('modelscope-search', requestedQuery, requestedCategory, pageNumber),
        () =>
          window.skillsManager.modelscopeMcpSearch(
            requestedQuery,
            pageNumber,
            requestedCategory,
          ),
      )
      return {
        items: result.items.map((item) => mapModelScopeItem(item, preferChinese.value)),
        total: result.total,
        categories: result.categories,
      }
    }
    const result = await cachedMcpMarketRequest(
      mcpMarketCacheKey('mcpso-search', requestedQuery, requestedCategory),
      () => window.skillsManager.mcpsoSearch(requestedQuery, requestedCategory),
    )
    return { items: result.items.map(mapMcpSoItem), total: result.items.length, categories: [] }
  }

  function cacheCatalog(): void {
    writeMcpMarketCatalogCache({
      source: source.value,
      query: activeQuery,
      modelScopeCategory: modelScopeCategory.value,
      mcpSoCategory: mcpSoCategory.value,
      categories: categories.value,
      items: items.value,
      total: total.value,
      page: page.value,
      preferChinese: preferChinese.value,
    })
  }

  async function fillModelScopeStats(ids: string[], requestId: number): Promise<void> {
    try {
      const uniqueIds = [...new Set(ids)].sort()
      const stats = await cachedMcpMarketRequest(
        mcpMarketCacheKey('modelscope-stats', ...uniqueIds),
        () => window.skillsManager.modelscopeMcpStats(uniqueIds),
      )
      if (requestId !== searchRequestId || source.value !== 'modelscope') return
      const byId = new Map(stats.map((item) => [item.id, item]))
      items.value = items.value.map((item) => {
        const value = byId.get(item.id)
        if (item.source !== 'modelscope' || !value) return item
        return {
          ...item,
          usageCount: value.usageCount ?? item.usageCount,
          favoriteCount: value.favoriteCount ?? item.favoriteCount,
          viewCount: value.viewCount ?? item.viewCount,
        }
      })
      cacheCatalog()
    } catch {
      /** 补充统计失败不影响市场基础列表展示。 */
    }
  }

  async function search(): Promise<void> {
    const requestId = ++searchRequestId
    const requestedSource = source.value
    const requestedQuery = query.value.trim()
    const requestedCategory = category.value !== ALL_CATEGORIES ? category.value : ''
    activeQuery = requestedQuery
    activeCategory = requestedCategory
    loading.value = true
    loadingMore.value = false
    error.value = null
    page.value = 1
    try {
      const result = await fetchPage(requestedSource, requestedQuery, requestedCategory, 1)
      if (requestId !== searchRequestId) return
      items.value = result.items
      total.value = result.total
      if (requestedSource === 'modelscope' && (!requestedCategory || categories.value.length === 0)) {
        categories.value = result.categories
      }
      cacheCatalog()
      if (requestedSource === 'modelscope') {
        void fillModelScopeStats(result.items.map((item) => item.id), requestId)
      }
    } catch (cause) {
      if (requestId !== searchRequestId) return
      items.value = []
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (requestId === searchRequestId) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (loading.value || loadingMore.value || !canLoadMore.value) return
    const requestId = searchRequestId
    const requestedSource = source.value
    /** 分页请求沿用最后一次已提交的查询和分类，避免草稿值串入旧列表。 */
    const requestedQuery = activeQuery
    const requestedCategory = activeCategory
    const nextPage = page.value + 1
    loadingMore.value = true
    try {
      const result = await fetchPage(requestedSource, requestedQuery, requestedCategory, nextPage)
      if (requestId !== searchRequestId) return
      page.value = nextPage
      total.value = result.total
      const knownKeys = new Set(items.value.map((item) => item.key))
      const nextItems = result.items.filter((item) => !knownKeys.has(item.key))
      items.value = [...items.value, ...nextItems]
      cacheCatalog()
      if (requestedSource === 'modelscope') {
        void fillModelScopeStats(nextItems.map((item) => item.id), requestId)
      }
    } catch (cause) {
      if (requestId !== searchRequestId) return
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (requestId === searchRequestId) loadingMore.value = false
    }
  }

  function setSource(value: McpMarketSourceId): void {
    source.value = value
  }

  function setQuery(value: string): void {
    query.value = value
  }

  function setCategory(value: string): void {
    category.value = value
  }

  watch([source, modelScopeCategory, mcpSoCategory], () => void search())

  onMounted(() => {
    void refresh({ silent: true })
    if (!initialCatalog) void search()
  })

  return {
    source,
    query,
    category,
    categoryOptions,
    items,
    loading,
    loadingMore,
    visibleError,
    canLoadMore,
    setSource,
    setQuery,
    setCategory,
    search,
    loadMore,
  }
}
