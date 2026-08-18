<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import type { MarketSourceId } from '@/lib/market'

const props = defineProps<{
  source: MarketSourceId
  query: string
}>()
const emit = defineEmits<{
  'update:source': [value: MarketSourceId]
  'update:query': [value: string]
  search: []
}>()

const { t } = useI18n()
const queryModel = computed({
  get: () => props.query,
  set: (value: string) => emit('update:query', value),
})
const placeholder = computed(() => {
  if (props.source === 'skills-sh') return t('market.searchPh')
  if (props.source === 'skillhub') return t('market.searchSkillhubPh')
  return t('market.searchGithubPh')
})

function selectSource(value: MarketSourceId): void {
  if (value !== props.source) emit('update:source', value)
}
</script>

<template>
  <div class="mb-3 flex items-center gap-2">
    <h3 class="text-base font-semibold">
      {{ t('market.title') }}
    </h3>
    <div class="flex-1" />
    <button
      type="button"
      :class="[
        'cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors',
        props.source === 'skills-sh'
          ? 'nav-active'
          : 'text-muted-foreground hover:bg-accent/60',
      ]"
      @click="selectSource('skills-sh')"
    >
      {{ t('market.sourceSkillsSh') }}
    </button>
    <button
      type="button"
      :class="[
        'cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors',
        props.source === 'skillhub'
          ? 'nav-active'
          : 'text-muted-foreground hover:bg-accent/60',
      ]"
      @click="selectSource('skillhub')"
    >
      {{ t('market.sourceSkillhub') }}
    </button>
    <button
      type="button"
      :class="[
        'cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors',
        props.source === 'github'
          ? 'nav-active'
          : 'text-muted-foreground hover:bg-accent/60',
      ]"
      @click="selectSource('github')"
    >
      {{ t('market.sourceGithub') }}
    </button>
  </div>

  <div class="relative mb-3">
    <Search
      class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      v-model="queryModel"
      :placeholder="placeholder"
      class="pl-8"
      @keydown.enter="emit('search')"
    />
  </div>
</template>
