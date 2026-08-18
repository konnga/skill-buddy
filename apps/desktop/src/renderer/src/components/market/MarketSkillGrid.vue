<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarketSkillCard from '@/components/market/MarketSkillCard.vue'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketItem } from '@/lib/market'

const props = defineProps<{
  items: MarketItem[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  actionMode: 'install' | 'team-library'
}>()
const emit = defineEmits<{
  open: [item: MarketItem]
  loadMore: []
}>()

const { t } = useI18n()
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
  <ul v-if="props.loading" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
    <li v-for="index in 8" :key="index">
      <div class="flex h-full flex-col rounded-2xl border bg-card px-3.5 py-3.5">
        <div class="flex items-center gap-2.5">
          <Skeleton class="size-8 shrink-0 rounded-full" />
          <Skeleton class="h-4 flex-1" />
          <Skeleton class="size-7 shrink-0 rounded-lg" />
        </div>
        <Skeleton class="mt-3 h-3 w-full" />
        <Skeleton class="mt-1.5 h-3 w-3/4" />
        <div class="mt-3 flex gap-3">
          <Skeleton class="h-3 w-10" />
          <Skeleton class="h-3 w-10" />
        </div>
      </div>
    </li>
  </ul>
  <p
    v-else-if="props.items.length === 0"
    class="py-10 text-center text-sm text-muted-foreground"
  >
    {{ t('market.empty') }}
  </p>

  <template v-else>
    <ul class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
      <li v-for="item in props.items" :key="item.key">
        <MarketSkillCard
          :item="item"
          :action-mode="props.actionMode"
          :icon-broken="brokenIcons.has(item.key)"
          @open="emit('open', item)"
          @icon-error="markIconBroken(item.key)"
        />
      </li>
    </ul>

    <div v-if="props.hasMore" ref="loadMoreTrigger" class="pt-3">
      <ul
        v-if="props.loadingMore"
        class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
      >
        <li v-for="index in 4" :key="index">
          <div class="flex h-full flex-col rounded-2xl border bg-card px-3.5 py-3.5">
            <div class="flex items-center gap-2.5">
              <Skeleton class="size-8 shrink-0 rounded-full" />
              <Skeleton class="h-4 flex-1" />
              <Skeleton class="size-7 shrink-0 rounded-lg" />
            </div>
            <Skeleton class="mt-3 h-3 w-full" />
            <Skeleton class="mt-1.5 h-3 w-3/4" />
            <div class="mt-3 flex gap-3">
              <Skeleton class="h-3 w-10" />
              <Skeleton class="h-3 w-10" />
            </div>
          </div>
        </li>
      </ul>
    </div>
  </template>
</template>
