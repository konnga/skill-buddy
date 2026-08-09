<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Import, Plus, RefreshCw, TriangleAlert } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import DashboardPage from '@/components/DashboardPage.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkills } from '@/composables/useSkills'
import { useTeam } from '@/composables/useTeam'
import type { SkillBundle } from '@/lib/bundles'
import type { MarketItem } from '@/lib/market'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{
  openMarket: [item: MarketItem]
  openBundles: []
  openBundle: [bundle: SkillBundle]
  openAttention: []
  newSkill: []
  importSkills: []
}>()

const { t } = useI18n()
const { skills, detectedPlatforms, loading, refresh } = useSkills()
const { updates, missingRequired } = useTeam()

const todoCount = computed(() => {
  const drift = skills.value.filter(
    (skill) =>
      skill.hasDrift && skill.installations.some((installation) => !installation.readOnly),
  ).length
  const singleEnd = skills.value.filter((skill: AggregatedSkill) => {
    const agents = new Set(skill.installations.map((installation) => installation.agent))
    return agents.size === 1 && detectedPlatforms.value.length > 1
  }).length
  return drift + singleEnd + updates.value.length + missingRequired.value.length
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <div class="flex-1" />
      <button
        type="button"
        :class="[
          'app-no-drag flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
          todoCount > 0
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : 'text-muted-foreground hover:border-primary/40',
        ]"
        :title="t('dashboard.todo')"
        @click="emit('openAttention')"
      >
        <TriangleAlert class="size-3.5" />
        {{ t('dashboard.todo') }}
        <span
          v-if="todoCount > 0"
          class="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold tabular-nums text-white"
        >
          {{ todoCount }}
        </span>
      </button>
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('newSkill')">
        <Plus />
        {{ t('dashboard.actionNew') }}
      </Button>
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('importSkills')">
        <Import />
        {{ t('dashboard.actionImport') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag"
        :disabled="loading"
        @click="refresh"
      >
        <RefreshCw :class="loading ? 'animate-spin' : ''" />
        {{ t('app.rescan') }}
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <DashboardPage
        @open-market="emit('openMarket', $event)"
        @open-bundles="emit('openBundles')"
        @open-bundle="emit('openBundle', $event)"
      />
    </ScrollArea>
  </div>
</template>
