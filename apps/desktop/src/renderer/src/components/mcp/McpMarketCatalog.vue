<script setup lang="ts">
import McpMarketFilters from '@/components/mcp/McpMarketFilters.vue'
import McpMarketGrid from '@/components/mcp/McpMarketGrid.vue'
import { useMcpMarketCatalog } from '@/composables/useMcpMarketCatalog'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = withDefaults(
  defineProps<{
    actionMode?: 'install' | 'team-library'
  }>(),
  {
    actionMode: 'install',
  },
)
const emit = defineEmits<{
  openDetail: [item: McpMarketItem]
  install: [item: McpMarketItem]
}>()

const {
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
} = useMcpMarketCatalog()
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <McpMarketFilters
      :source="source"
      :query="query"
      :category="category"
      :category-options="categoryOptions"
      @update:source="setSource"
      @update:query="setQuery"
      @update:category="setCategory"
      @search="search"
    />

    <p v-if="visibleError" class="break-all px-6 pb-3 text-sm text-destructive">
      {{ visibleError }}
    </p>

    <McpMarketGrid
      :items="items"
      :loading="loading"
      :loading-more="loadingMore"
      :can-load-more="canLoadMore"
      :action-mode="props.actionMode"
      @open-detail="emit('openDetail', $event)"
      @install="emit('install', $event)"
      @load-more="loadMore"
    />
  </section>
</template>
