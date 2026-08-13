<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@lucide/vue'
import McpMarketCardSummary from '@/components/mcp/McpMarketCardSummary.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useMcpServers } from '@/composables/useMcpServers'
import {
  mapMcpSoItem,
  mapModelScopeItem,
  type McpMarketItem,
  type McpMarketSourceId,
} from '@/lib/mcp-market'

const { t, locale } = useI18n()
const emit = defineEmits<{ openDetail: [item: McpMarketItem] }>()
const { refresh, error: mcpError } = useMcpServers()

/** 魔搭分页约束：page_number * page_size <= 100，接口按 24 条分页，最多加载 4 页。 */
const MODELSCOPE_MAX = 96

const source = shallowRef<McpMarketSourceId>('modelscope')
const query = shallowRef('')
const items = ref<McpMarketItem[]>([])
const total = shallowRef(0)
const page = shallowRef(1)
const loading = shallowRef(false)
const loadingMore = shallowRef(false)
const error = shallowRef<string | null>(null)
const brokenIcons = ref(new Set<string>())

let searchRequestId = 0

const preferChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
const visibleError = computed(() => error.value ?? mcpError.value)
const canLoadMore = computed(
  () =>
    source.value === 'modelscope' &&
    items.value.length > 0 &&
    items.value.length < Math.min(total.value, MODELSCOPE_MAX),
)

async function fetchPage(
  requestedSource: McpMarketSourceId,
  requestedQuery: string,
  pageNumber: number,
  preferChineseNames: boolean,
): Promise<{ items: McpMarketItem[]; total: number }> {
  if (requestedSource === 'modelscope') {
    const result = await window.skillsManager.modelscopeMcpSearch(requestedQuery, pageNumber)
    return {
      items: result.items.map((item) => mapModelScopeItem(item, preferChineseNames)),
      total: result.total,
    }
  }
  const result = await window.skillsManager.mcpsoSearch(requestedQuery)
  return { items: result.items.map(mapMcpSoItem), total: result.items.length }
}

async function fillModelScopeStats(ids: string[], requestId: number): Promise<void> {
  try {
    const stats = await window.skillsManager.modelscopeMcpStats(ids)
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
  } catch {
    // 补充统计失败不影响市场基础列表展示
  }
}

async function search(): Promise<void> {
  const requestId = ++searchRequestId
  const requestedSource = source.value
  const requestedQuery = query.value.trim()
  loading.value = true
  loadingMore.value = false
  error.value = null
  page.value = 1
  try {
    const result = await fetchPage(requestedSource, requestedQuery, 1, preferChinese.value)
    if (requestId !== searchRequestId) return
    items.value = result.items
    total.value = result.total
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
  if (loadingMore.value || !canLoadMore.value) return
  const requestId = searchRequestId
  const requestedSource = source.value
  const requestedQuery = query.value.trim()
  const nextPage = page.value + 1
  loadingMore.value = true
  try {
    const result = await fetchPage(
      requestedSource,
      requestedQuery,
      nextPage,
      preferChinese.value,
    )
    if (requestId !== searchRequestId) return
    page.value = nextPage
    total.value = result.total
    const known = new Set(items.value.map((item) => item.key))
    const nextItems = result.items.filter((item) => !known.has(item.key))
    items.value = [...items.value, ...nextItems]
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

watch(source, () => void search())
onMounted(() => {
  void refresh({ silent: true })
  void search()
})
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
          class="h-44 cursor-pointer rounded-xl border bg-card px-5 py-4 shadow-sm transition-colors hover:border-foreground/20 hover:bg-accent/20"
          @click="emit('openDetail', item)"
        >
          <McpMarketCardSummary
            :item="item"
            :icon-broken="brokenIcons.has(item.key)"
            @icon-error="brokenIcons.add(item.key)"
            @open-page="openPage(item.link)"
            @open-detail="emit('openDetail', item)"
          />
        </li>
      </ul>

      <div v-if="canLoadMore" class="mt-3 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          class="cursor-pointer"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ t('mcp.market.loadMore') }}
        </Button>
      </div>
    </ScrollArea>
  </section>
</template>
