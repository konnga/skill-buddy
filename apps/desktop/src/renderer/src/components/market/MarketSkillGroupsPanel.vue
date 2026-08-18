<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import type { MarketGroupOption } from '@/composables/useMarketSkillDetail'

const props = defineProps<{
  groups: MarketGroupOption[]
  selected: Set<string>
}>()
const emit = defineEmits<{
  toggle: [name: string]
  add: []
}>()

const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border px-5 py-4">
    <h3 class="text-sm font-medium">{{ t('market.addToGroups') }}</h3>
    <div v-if="props.groups.length > 0" class="flex flex-wrap gap-2">
      <button
        v-for="group in props.groups"
        :key="group.name"
        type="button"
        :disabled="group.member"
        :class="[
          'flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm transition-colors',
          group.member
            ? 'cursor-default border-foreground/20 bg-muted text-muted-foreground'
            : props.selected.has(group.name)
              ? 'border-foreground bg-foreground text-background'
              : 'hover:border-foreground/40',
        ]"
        @click="emit('toggle', group.name)"
      >
        {{ group.name }}
      </button>
    </div>
    <p v-else class="text-sm text-muted-foreground">{{ t('market.noGroups') }}</p>
    <Button
      v-if="props.groups.length > 0"
      variant="outline"
      class="w-fit cursor-pointer"
      :disabled="props.selected.size === 0"
      @click="emit('add')"
    >
      {{ t('market.addToGroupsAction', { n: props.selected.size }) }}
    </Button>
  </section>
</template>
