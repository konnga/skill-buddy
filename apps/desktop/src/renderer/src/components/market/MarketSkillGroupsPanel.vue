<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@lucide/vue'
import GroupCreateDialog from '@/components/groups/GroupCreateDialog.vue'
import { Button } from '@/components/ui/button'
import type { MarketGroupOption } from '@/composables/useMarketSkillDetail'
import type { MarketSkillSource } from '@/lib/market'

const props = defineProps<{
  groups: MarketGroupOption[]
  selected: Set<string>
  skillName: string | null
  skillSource: MarketSkillSource | null
}>()
const emit = defineEmits<{
  toggle: [name: string]
  add: []
}>()

const { t } = useI18n()
const createOpen = shallowRef(false)
const sourceReady = computed(() => Boolean(props.skillName && props.skillSource))
const initialSkillNames = computed(() => props.skillName ? [props.skillName] : [])
const initialSkillSources = computed<Record<string, MarketSkillSource>>(() =>
  props.skillName && props.skillSource ? { [props.skillName]: props.skillSource } : {},
)
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border px-5 py-4">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium">{{ t('market.addToGroups') }}</h3>
      <button
        type="button"
        class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!sourceReady"
        @click="createOpen = true"
      >
        <Plus class="size-3.5" />
        {{ t('groups.createTitle') }}
      </button>
    </div>
    <div v-if="props.groups.length > 0" class="flex flex-wrap gap-2">
      <button
        v-for="group in props.groups"
        :key="group.name"
        type="button"
        :disabled="group.member || !sourceReady"
        :class="[
          'flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
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
      :disabled="props.selected.size === 0 || !sourceReady"
      @click="emit('add')"
    >
      {{ t('market.addToGroupsAction', { n: props.selected.size }) }}
    </Button>
  </section>

  <GroupCreateDialog
    v-model:open="createOpen"
    :skill-names="initialSkillNames"
    :skill-sources="initialSkillSources"
  />
</template>
