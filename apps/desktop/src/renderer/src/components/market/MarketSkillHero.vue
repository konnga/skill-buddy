<script setup lang="ts">
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { BadgeCheck, Download, KeyRound, Star } from '@lucide/vue'
import {
  formatMarketCount,
  marketIconColor,
  marketIconGlyph,
  type MarketItem,
} from '@/lib/market'

const props = defineProps<{ item: MarketItem }>()
const emit = defineEmits<{ openSource: [] }>()
const { t } = useI18n()
const iconBroken = shallowRef(false)

function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000)
  if (minutes < 1) return t('dashboard.justNow')
  if (minutes < 60) return t('dashboard.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('dashboard.hoursAgo', { n: hours })
  return t('dashboard.daysAgo', { n: Math.floor(hours / 24) })
}
</script>

<template>
  <div class="flex items-start gap-5">
    <img
      v-if="props.item.icon && !iconBroken"
      :src="props.item.icon"
      class="size-16 shrink-0 rounded-2xl border object-cover"
      alt=""
      @error="iconBroken = true"
    />
    <span
      v-else
      :class="[
        'flex size-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white',
        marketIconColor(props.item.name),
      ]"
    >
      {{ marketIconGlyph(props.item.name) }}
    </span>
    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <h2 class="select-text min-w-0 truncate text-2xl font-bold tracking-tight">
          {{ props.item.name }}
        </h2>
        <BadgeCheck
          v-if="props.item.verified"
          class="size-5 shrink-0 text-sky-500"
          :title="t('market.verified')"
        />
      </div>
      <button
        type="button"
        class="select-text w-fit max-w-full cursor-pointer truncate text-left text-sm text-muted-foreground underline-offset-2 hover:underline"
        :title="t('market.viewSource')"
        @click="emit('openSource')"
      >
        {{
          props.item.kind === 'skillhub' && !props.item.sourceLabel.startsWith('@')
            ? `@${props.item.sourceLabel}`
            : props.item.sourceLabel
        }}
      </button>
      <div class="flex items-center gap-4 text-sm tabular-nums text-muted-foreground">
        <span
          v-if="props.item.installs > 0"
          class="flex items-center gap-1.5"
          :title="t('market.installs', { n: props.item.installs })"
        >
          <Download class="size-4" />
          {{ formatMarketCount(props.item.installs) }}
        </span>
        <span v-if="props.item.stars !== null" class="flex items-center gap-1.5" :title="t('market.stars')">
          <Star class="size-4" />
          {{ formatMarketCount(props.item.stars) }}
        </span>
      </div>
    </div>
  </div>

  <p
    v-if="props.item.description.trim()"
    class="select-text text-sm leading-relaxed text-foreground/85"
  >
    {{ props.item.description }}
  </p>

  <div
    v-if="
      props.item.requiresApiKey ||
      (props.item.tags?.length ?? 0) > 0 ||
      props.item.updatedAt ||
      props.item.version
    "
    class="flex flex-wrap items-center gap-2"
  >
    <span
      v-if="props.item.requiresApiKey"
      class="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-sm text-amber-700 dark:text-amber-400"
    >
      <KeyRound class="size-3" />
      {{ t('market.requiresApiKey') }}
    </span>
    <span
      v-for="tag in props.item.tags ?? []"
      :key="tag"
      class="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground"
    >
      {{ tag }}
    </span>
    <span
      v-if="props.item.updatedAt"
      class="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground"
    >
      {{ t('market.updated', { t: timeAgo(props.item.updatedAt) }) }}
    </span>
    <span
      v-if="props.item.version"
      class="rounded-full border px-2.5 py-0.5 text-sm tabular-nums text-muted-foreground"
    >
      v{{ props.item.version }}
    </span>
  </div>
</template>
