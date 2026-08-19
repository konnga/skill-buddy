<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Download, KeyRound, Plus, Star } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  formatMarketCount,
  marketIconColor,
  marketIconGlyph,
  type MarketItem,
} from '@/lib/market'

const props = defineProps<{
  item: MarketItem
  actionMode: 'install' | 'team-library'
  iconBroken: boolean
}>()
const emit = defineEmits<{
  open: []
  iconError: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="group flex h-full cursor-pointer flex-col rounded-2xl border bg-card px-3.5 py-3.5 transition-colors hover:border-foreground/25"
    role="button"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="flex items-center gap-2.5">
      <img
        v-if="props.item.icon && !props.iconBroken"
        :src="props.item.icon"
        class="size-8 shrink-0 rounded-lg border object-cover"
        loading="lazy"
        alt=""
        @error="emit('iconError')"
      />
      <span
        v-else
        :class="[
          'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
          marketIconColor(props.item.name),
        ]"
      >
        {{ marketIconGlyph(props.item.name) }}
      </span>
      <span
        class="min-w-0 flex-1 truncate text-[15px] font-semibold"
        :title="props.item.name"
      >
        {{ props.item.name }}
      </span>
      <KeyRound
        v-if="props.item.requiresApiKey"
        class="size-3.5 shrink-0 text-muted-foreground"
        :title="t('market.requiresApiKey')"
      />
      <Button
        variant="outline"
        size="icon"
        class="size-7 shrink-0 cursor-pointer rounded-lg"
        :title="props.actionMode === 'team-library' ? t('team.addToLibrary') : t('market.install')"
        @click.stop="emit('open')"
      >
        <Plus class="size-3.5" />
      </Button>
    </div>
    <p class="mt-2 line-clamp-2 min-h-8 text-sm leading-relaxed text-muted-foreground">
      {{ props.item.description || props.item.sourceLabel }}
    </p>
    <div class="mt-2 flex items-center gap-3 text-sm tabular-nums text-muted-foreground">
      <span
        class="flex items-center gap-1"
        :title="t('market.installs', { n: props.item.installs })"
      >
        <Download class="size-3.5" />
        {{ formatMarketCount(props.item.installs) }}
      </span>
      <span v-if="props.item.stars !== null" class="flex items-center gap-1" :title="t('market.stars')">
        <Star class="size-3.5" />
        {{ formatMarketCount(props.item.stars) }}
      </span>
    </div>
  </div>
</template>
