<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@lucide/vue'
import McpMarketCardSummary from '@/components/mcp/McpMarketCardSummary.vue'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, type SelectOption } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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

const props = withDefaults(defineProps<{
  actionMode?: 'install' | 'team-library'
}>(), {
  actionMode: 'install',
})
const { t, locale } = useI18n()
const emit = defineEmits<{
  openDetail: [item: McpMarketItem]
  install: [item: McpMarketItem]
}>()
const { refresh, error: mcpError } = useMcpServers()

const ALL_CATEGORIES = 'all'
const preferChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
const cachedCatalog = readMcpMarketCatalogCache()
const initialCatalog =
  cachedCatalog?.preferChinese === preferChinese.value ? cachedCatalog : undefined

const source = shallowRef<McpMarketSourceId>(initialCatalog?.source ?? 'modelscope')
const query = shallowRef(initialCatalog?.query ?? '')
const modelScopeCategory = shallowRef(initialCatalog?.modelScopeCategory || ALL_CATEGORIES)
const mcpSoCategory = shallowRef(initialCatalog?.mcpSoCategory || ALL_CATEGORIES)
const category = computed({
  get: () => (source.value === 'modelscope' ? modelScopeCategory.value : mcpSoCategory.value),
  set: (value: string) => {
    if (source.value === 'modelscope') modelScopeCategory.value = value
    else mcpSoCategory.value = value
  },
})
const categories = ref<McpMarketCategory[]>(initialCatalog?.categories ?? [])
const items = ref<McpMarketItem[]>(initialCatalog?.items ?? [])
const total = shallowRef(initialCatalog?.total ?? 0)
const page = shallowRef(initialCatalog?.page ?? 1)
const loading = shallowRef(false)
const loadingMore = shallowRef(false)
const error = shallowRef<string | null>(null)
const brokenIcons = ref(new Set<string>())

let searchRequestId = 0

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
  preferChineseNames: boolean,
): Promise<{ items: McpMarketItem[]; total: number; categories: McpMarketCategory[] }> {
  if (requestedSource === 'modelscope') {
    const result = await cachedMcpMarketRequest(
      mcpMarketCacheKey('modelscope-search', requestedQuery, requestedCategory, pageNumber),
      () =>
        window.skillsManager.modelscopeMcpSearch(requestedQuery, pageNumber, requestedCategory),
    )
    return {
      items: result.items.map((item) => mapModelScopeItem(item, preferChineseNames)),
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
    query: query.value,
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
      if (item.source !== 'modelscope') return item
      const value = byId.get(item.id)
      if (!value) return item
      return {
        ...item,
        usageCount: value.usageCount ?? item.usageCount,
        favoriteCount: value.favoriteCount ?? item.favoriteCount,
        viewCount: value.viewCount ?? item.viewCount,
      }
    })
    cacheCatalog()
  } catch {
    // 补充统计失败不影响市场基础列表展示
  }
}

async function search(): Promise<void> {
  const requestId = ++searchRequestId
  const requestedSource = source.value
  const requestedQuery = query.value.trim()
  const requestedCategory = category.value !== ALL_CATEGORIES ? category.value : ''
  loading.value = true
  loadingMore.value = false
  error.value = null
  page.value = 1
  try {
    const result = await fetchPage(
      requestedSource,
      requestedQuery,
      requestedCategory,
      1,
      preferChinese.value,
    )
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
  const requestedQuery = query.value.trim()
  const requestedCategory = category.value !== ALL_CATEGORIES ? category.value : ''
  const nextPage = page.value + 1
  loadingMore.value = true
  try {
    const result = await fetchPage(
      requestedSource,
      requestedQuery,
      requestedCategory,
      nextPage,
      preferChinese.value,
    )
    if (requestId !== searchRequestId) return
    page.value = nextPage
    total.value = result.total
    const known = new Set(items.value.map((item) => item.key))
    const nextItems = result.items.filter((item) => !known.has(item.key))
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

function openPage(url: string): void {
  void window.skillsManager.openLink(url)
}

/** 提前 200px 观察列表尾部，进入视区后自动加载下一页。 */
const loadMoreTrigger = useTemplateRef<HTMLElement>('loadMoreTrigger')
let loadMoreObserver: IntersectionObserver | undefined

watch([source, modelScopeCategory, mcpSoCategory], () => void search())
watch(loadMoreTrigger, (element, previousElement) => {
  if (previousElement) loadMoreObserver?.unobserve(previousElement)
  if (element) loadMoreObserver?.observe(element)
})

onMounted(() => {
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    },
    { rootMargin: '200px' },
  )
  if (loadMoreTrigger.value) loadMoreObserver.observe(loadMoreTrigger.value)
  void refresh({ silent: true })
  if (!initialCatalog) void search()
})

onUnmounted(() => loadMoreObserver?.disconnect())
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-3 px-6 py-4">
      <div class="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-muted p-1">
        <button
          type="button"
          :class="[
            'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
            source === 'modelscope'
              ? 'bg-background font-medium shadow-sm'
              : 'text-muted-foreground',
          ]"
          @click="source = 'modelscope'"
        >
          {{ t('mcp.market.sourceModelScope') }}
        </button>
        <button
          type="button"
          :class="[
            'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
            source === 'mcp-so'
              ? 'bg-background font-medium shadow-sm'
              : 'text-muted-foreground',
          ]"
          @click="source = 'mcp-so'"
        >
          {{ t('mcp.market.sourceMcpSo') }}
        </button>
      </div>
      <Select
        v-model="category"
        :options="categoryOptions"
        class="h-9 w-52 cursor-pointer"
      />
      <div class="relative flex-1">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="query"
          :placeholder="t('mcp.market.searchPh')"
          class="pl-8"
          @keydown.enter="search"
        />
      </div>
    </div>

    <p v-if="visibleError" class="break-all px-6 pb-3 text-sm text-destructive">
      {{ visibleError }}
    </p>

    <ScrollArea class="flex-1" viewport-class="px-6 pb-6">
      <div v-if="loading" class="grid grid-cols-2 gap-3">
        <Skeleton v-for="index in 6" :key="index" class="h-44 rounded-xl" />
      </div>
      <p
        v-else-if="items.length === 0"
        class="py-16 text-center text-sm text-muted-foreground"
      >
        {{ t('mcp.market.empty') }}
      </p>

      <ul v-else class="grid grid-cols-2 gap-3">
        <li
          v-for="item in items"
          :key="item.key"
          class="h-44 cursor-pointer rounded-xl border bg-card px-5 py-4 transition-[background-color,border-color,box-shadow] hover:border-foreground/20 hover:bg-accent/20 hover:shadow-sm"
          @click="emit('openDetail', item)"
        >
          <McpMarketCardSummary
            :item="item"
            :icon-broken="brokenIcons.has(item.key)"
            :action-mode="props.actionMode"
            @icon-error="brokenIcons.add(item.key)"
            @open-page="openPage(item.link)"
            @open-detail="emit('openDetail', item)"
            @install="emit('install', item)"
          />
        </li>
      </ul>

      <div v-if="canLoadMore" ref="loadMoreTrigger" class="pt-3">
        <ul v-if="loadingMore" class="grid grid-cols-2 gap-3">
          <li v-for="index in 2" :key="index">
            <Skeleton class="h-44 rounded-xl" />
          </li>
        </ul>
      </div>
    </ScrollArea>
  </section>
</template>
