<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Activity, CloudDownload, Eye, ExternalLink, Heart, LibraryBig } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { marketIconColor, marketIconGlyph } from '@/lib/market'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = withDefaults(defineProps<{
  item: McpMarketItem
  iconBroken: boolean
  actionMode?: 'install' | 'team-library'
}>(), {
  actionMode: 'install',
})
const emit = defineEmits<{ openDetail: []; openPage: []; install: []; iconError: [] }>()
const { t } = useI18n()
const visibleTags = computed(() => props.item.tags.slice(0, 2))
const hiddenTagCount = computed(() => Math.max(0, props.item.tags.length - visibleTags.value.length))
const authorLabel = computed(() => {
  const author = props.item.author.trim()
  return !author || author.startsWith('@') ? author : `@${author}`
})
const activityMetric = computed(() => {
  if (props.item.usageCount !== null) {
    return { value: props.item.usageCount, title: t('mcp.market.usage') }
  }
  if (props.item.downloadCount !== null) {
    return { value: props.item.downloadCount, title: t('mcp.market.downloads') }
  }
  return null
})

function formatMetricCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-start gap-3">
      <img
        v-if="item.icon && !iconBroken"
        :src="item.icon"
        alt=""
        class="size-9 shrink-0 rounded-md border object-cover"
        loading="lazy"
        @error="emit('iconError')"
      />
      <span
        v-else
        :class="[
          'grid size-9 shrink-0 place-items-center rounded-md text-sm font-semibold text-white',
          marketIconColor(item.name),
        ]"
      >
        {{ marketIconGlyph(item.name) }}
      </span>
      <div class="min-w-0 flex-1 pt-0.5">
        <button
          type="button"
          class="block max-w-full cursor-pointer truncate text-left text-base font-semibold leading-6 hover:underline"
          :title="item.name"
          @click.stop="emit('openDetail')"
        >
          {{ item.name }}
        </button>
        <div class="mt-1.5 flex h-5 min-w-0 items-center gap-1.5 overflow-hidden">
          <span
            v-for="tag in visibleTags"
            :key="tag"
            class="max-w-40 truncate rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
            :title="tag"
          >
            {{ tag }}
          </span>
          <span
            v-if="hiddenTagCount > 0"
            class="rounded bg-muted/60 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
          >
            +{{ hiddenTagCount }}
          </span>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer"
          :title="t('mcp.market.openPage')"
          :aria-label="t('mcp.market.openPage')"
          @click.stop="emit('openPage')"
        >
          <ExternalLink />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="cursor-pointer"
          @click.stop="emit('install')"
        >
          <LibraryBig v-if="props.actionMode === 'team-library'" />
          <CloudDownload v-else />
          {{ props.actionMode === 'team-library' ? '加入团队库' : t('mcp.market.install') }}
        </Button>
      </div>
    </div>
    <p
      v-if="item.description"
      class="mt-3 line-clamp-2 h-12 text-sm leading-6 text-muted-foreground"
    >
      {{ item.description }}
    </p>
    <div v-else class="mt-3 h-12" />
    <div class="mt-auto flex min-w-0 items-center gap-0 pt-3 text-sm text-muted-foreground">
      <span v-if="authorLabel" class="truncate font-medium" :title="authorLabel">
        {{ authorLabel }}
      </span>
      <span class="flex-1" />
      <div
        v-if="activityMetric || item.viewCount !== null || item.favoriteCount !== null"
        class="flex shrink-0 items-center text-muted-foreground"
      >
        <span
          v-if="activityMetric"
          class="flex items-center gap-1.5 px-3 tabular-nums"
          :title="activityMetric.title"
        >
          <Activity class="size-4" />
          {{ formatMetricCount(activityMetric.value) }}
        </span>
        <span v-if="activityMetric && item.viewCount !== null" class="h-4 w-px bg-border" />
        <span
          v-if="item.viewCount !== null"
          class="flex items-center gap-1.5 px-3 tabular-nums"
          :title="t('mcp.market.views', { n: item.viewCount })"
        >
          <Eye class="size-4" />
          {{ formatMetricCount(item.viewCount) }}
        </span>
        <span
          v-if="item.viewCount !== null && item.favoriteCount !== null"
          class="h-4 w-px bg-border"
        />
        <span
          v-if="item.favoriteCount !== null"
          class="flex items-center gap-1.5 pl-3 tabular-nums"
          :title="t('mcp.market.favorites')"
        >
          <Heart class="size-4" />
          {{ formatMetricCount(item.favoriteCount) }}
        </span>
      </div>
    </div>
  </div>
</template>
