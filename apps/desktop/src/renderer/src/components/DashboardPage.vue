<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ChevronRight,
  Blocks,
  FolderGit2,
  History,
  Import,
  MonitorCheck,
  Plus,
  RefreshCw,
  TriangleAlert,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeam } from '@/composables/useTeam'
import MarketDiscovery from '@/components/MarketDiscovery.vue'
import type { MarketItem } from '@/lib/market'

const emit = defineEmits<{
  openSkill: [skill: AggregatedSkill]
  openMarket: [item: MarketItem]
  openAttention: []
  newSkill: []
  import: []
}>()

const { skills, detectedPlatforms, loading, refresh } = useSkills()
const { projectRoots } = useSettings()
const { updates, missingRequired } = useTeam()
const { t } = useI18n()

const todoCount = computed(
  () =>
    driftSkills.value.length +
    singleEndSkills.value.length +
    updates.value.length +
    missingRequired.value.length,
)

const driftSkills = computed(() => skills.value.filter((s) => s.hasDrift))

/** Skills installed on exactly one platform while others are available. */
const singleEndSkills = computed(() =>
  skills.value.filter((s) => {
    const agents = new Set(s.installations.map((i) => i.agent))
    return agents.size === 1 && detectedPlatforms.value.length > 1
  }),
)

const recentSkills = computed(() =>
  [...skills.value]
    .map((s) => ({
      skill: s,
      modifiedAt: Math.max(...s.installations.map((i) => i.modifiedAt ?? 0)),
    }))
    .filter((s) => s.modifiedAt > 0)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, 5),
)

const stats = computed(() => [
  { icon: Blocks, label: t('dashboard.totalSkills'), value: skills.value.length },
  {
    icon: MonitorCheck,
    label: t('dashboard.platformsDetected'),
    value: detectedPlatforms.value.length,
  },
  {
    icon: TriangleAlert,
    label: t('dashboard.driftCount'),
    value: driftSkills.value.length,
    warn: driftSkills.value.length > 0,
  },
  { icon: FolderGit2, label: t('dashboard.projectDirs'), value: projectRoots.value.length },
])
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
    <!-- stats -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card v-for="stat in stats" :key="stat.label">
        <CardContent class="flex flex-col gap-1 p-4">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <component
              :is="stat.icon"
              :class="['size-3.5', stat.warn && 'text-amber-500']"
            />
            {{ stat.label }}
          </div>
          <span
            :class="[
              'text-2xl font-semibold tabular-nums tracking-tight',
              stat.warn && 'text-amber-600 dark:text-amber-400',
            ]"
          >
            {{ stat.value }}
          </span>
        </CardContent>
      </Card>
    </div>

    <!-- quick actions -->
    <section>
      <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('dashboard.quickActions') }}
      </h3>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
          <RefreshCw :class="loading ? 'animate-spin' : ''" />
          {{ t('app.rescan') }}
        </Button>
        <Button variant="outline" size="sm" @click="emit('newSkill')">
          <Plus />
          {{ t('dashboard.actionNew') }}
        </Button>
        <Button variant="outline" size="sm" @click="emit('import')">
          <Import />
          {{ t('dashboard.actionImport') }}
        </Button>
      </div>
    </section>

    <!-- needs attention / recent: badge-count entries, lists live on AttentionPage -->
    <div class="flex flex-col gap-2">
      <button
        :class="[
          'flex w-full items-center gap-2.5 rounded-md border px-4 py-2.5 text-left text-sm transition-colors hover:border-foreground/25',
          todoCount > 0 && 'border-amber-500/30 bg-amber-500/5',
        ]"
        @click="emit('openAttention')"
      >
        <TriangleAlert
          :class="['size-4 shrink-0', todoCount > 0 ? 'text-amber-500' : 'text-muted-foreground']"
        />
        <span>{{ t('dashboard.todo') }}</span>
        <Badge v-if="todoCount > 0" variant="secondary" class="text-[10px] tabular-nums">
          {{ todoCount }}
        </Badge>
        <div class="flex-1" />
        <ChevronRight class="size-4 text-muted-foreground" />
      </button>
      <button
        v-if="recentSkills.length > 0"
        class="flex w-full items-center gap-2.5 rounded-md border px-4 py-2.5 text-left text-sm transition-colors hover:border-foreground/25"
        @click="emit('openAttention')"
      >
        <History class="size-4 shrink-0 text-muted-foreground" />
        <span>{{ t('dashboard.recent') }}</span>
        <Badge variant="secondary" class="text-[10px] tabular-nums">
          {{ recentSkills.length }}
        </Badge>
        <div class="flex-1" />
        <ChevronRight class="size-4 text-muted-foreground" />
      </button>
    </div>

    <!-- marketplace discovery -->
    <MarketDiscovery @open="emit('openMarket', $event)" />
  </div>
</template>
