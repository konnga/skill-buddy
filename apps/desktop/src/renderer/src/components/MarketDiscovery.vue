<script setup lang="ts">
import MarketSkillGrid from '@/components/market/MarketSkillGrid.vue'
import MarketSourceToolbar from '@/components/market/MarketSourceToolbar.vue'
import { useSkillMarketDiscovery } from '@/composables/useSkillMarketDiscovery'
import type { MarketItem } from '@/lib/market'

const props = withDefaults(
  defineProps<{
    actionMode?: 'install' | 'team-library'
  }>(),
  {
    actionMode: 'install',
  },
)
const emit = defineEmits<{ open: [item: MarketItem] }>()

const {
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
} = useSkillMarketDiscovery()
</script>

<template>
  <section>
    <MarketSourceToolbar
      :source="source"
      :query="query"
      @update:source="setSource"
      @update:query="setQuery"
      @search="search"
    />

    <p v-if="error" class="mb-2 break-all text-sm text-destructive">{{ error }}</p>

    <MarketSkillGrid
      :items="items"
      :loading="loading"
      :loading-more="loadingMore"
      :has-more="hasMore"
      :action-mode="props.actionMode"
      @open="emit('open', $event)"
      @load-more="loadMore"
    />
  </section>
</template>
