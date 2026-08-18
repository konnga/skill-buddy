<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import McpMarketCardSummary from '@/components/mcp/McpMarketCardSummary.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = defineProps<{
  items: McpMarketItem[]
  loading: boolean
  loadingMore: boolean
  canLoadMore: boolean
  actionMode: 'install' | 'team-library'
}>()
const emit = defineEmits<{
  openDetail: [item: McpMarketItem]
  install: [item: McpMarketItem]
  openPage: [url: string]
  loadMore: []
}>()

const brokenIcons = ref(new Set<string>())
const loadMoreTrigger = useTemplateRef<HTMLElement>('loadMoreTrigger')
let loadMoreObserver: IntersectionObserver | undefined

function markIconBroken(key: string): void {
  brokenIcons.value = new Set(brokenIcons.value).add(key)
}

watch(loadMoreTrigger, (element, previousElement) => {
  if (previousElement) loadMoreObserver?.unobserve(previousElement)
  if (element) loadMoreObserver?.observe(element)
})

onMounted(() => {
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) emit('loadMore')
    },
    { rootMargin: '200px' },
  )
  if (loadMoreTrigger.value) loadMoreObserver.observe(loadMoreTrigger.value)
})

onUnmounted(() => loadMoreObserver?.disconnect())
</script>

<template>
  <ScrollArea class="flex-1" viewport-class="px-6 pb-6">
    <div v-if="props.loading" class="grid grid-cols-2 gap-3">
      <Skeleton v-for="index in 6" :key="index" class="h-44 rounded-xl" />
    </div>
    <p v-else-if="props.items.length === 0" class="py-16 text-center text-sm text-muted-foreground">
      {{ $t('mcp.market.empty') }}
    </p>

    <ul v-else class="grid grid-cols-2 gap-3">
      <li
        v-for="item in props.items"
        :key="item.key"
        class="h-44 cursor-pointer rounded-xl border bg-card px-5 py-4 transition-[background-color,border-color,box-shadow] hover:border-foreground/20 hover:bg-accent/20 hover:shadow-sm"
        @click="emit('openDetail', item)"
      >
        <McpMarketCardSummary
          :item="item"
          :icon-broken="brokenIcons.has(item.key)"
          :action-mode="props.actionMode"
          @icon-error="markIconBroken(item.key)"
          @open-page="emit('openPage', item.link)"
          @open-detail="emit('openDetail', item)"
          @install="emit('install', item)"
        />
      </li>
    </ul>

    <div v-if="props.canLoadMore" ref="loadMoreTrigger" class="pt-3">
      <ul v-if="props.loadingMore" class="grid grid-cols-2 gap-3">
        <li v-for="index in 2" :key="index">
          <Skeleton class="h-44 rounded-xl" />
        </li>
      </ul>
    </div>
  </ScrollArea>
</template>
