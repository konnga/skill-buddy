<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowRight,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Blocks,
  FolderGit2,
  Import,
  MonitorCheck,
  Plus,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { installRequired, upgradeSkill, useTeam } from '@/composables/useTeam'
import MarketDiscovery from '@/components/MarketDiscovery.vue'

const emit = defineEmits<{
  openSkill: [skill: AggregatedSkill]
  newSkill: []
  import: []
}>()

const { skills, detectedPlatforms, loading, refresh } = useSkills()
const { projectRoots } = useSettings()
const { updates, missingRequired } = useTeam()
const { t } = useI18n()

const teamBusy = ref<string | null>(null)
const todoOpen = ref(false)

const todoCount = computed(
  () =>
    driftSkills.value.length +
    singleEndSkills.value.length +
    updates.value.length +
    missingRequired.value.length,
)

async function runUpgrade(item: (typeof updates.value)[number]): Promise<void> {
  teamBusy.value = `${item.org}/${item.name}`
  try {
    await upgradeSkill(item)
  } finally {
    teamBusy.value = null
  }
}

async function runInstallRequired(item: (typeof missingRequired.value)[number]): Promise<void> {
  teamBusy.value = `${item.org}/${item.name}`
  try {
    await installRequired(item)
  } finally {
    teamBusy.value = null
  }
}

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

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('dashboard.justNow')
  if (min < 60) return t('dashboard.minutesAgo', { n: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('dashboard.hoursAgo', { n: hours })
  return t('dashboard.daysAgo', { n: Math.floor(hours / 24) })
}

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

function otherAgentCount(s: AggregatedSkill): number {
  const agents = new Set(s.installations.map((i) => i.agent))
  return detectedPlatforms.value.filter((p) => !agents.has(p.id)).length
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
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

    <!-- needs attention (collapsed by default) -->
    <section>
      <button
        class="mb-2 flex w-full items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        @click="todoOpen = !todoOpen"
      >
        <component :is="todoOpen ? ChevronDown : ChevronRight" class="size-3.5" />
        {{ t('dashboard.todo') }}
        <Badge v-if="todoCount > 0" variant="secondary" class="text-[10px]">{{ todoCount }}</Badge>
      </button>
      <p
        v-if="todoOpen && todoCount === 0"
        class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
      >
        {{ t('dashboard.todoEmpty') }}
      </p>
      <ul v-else-if="todoOpen" class="flex flex-col gap-2">
        <li
          v-for="item in missingRequired"
          :key="`required-${item.org}/${item.name}`"
          class="flex items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2.5"
        >
          <span class="flex min-w-0 items-center gap-2 text-sm">
            <ShieldAlert class="size-4 shrink-0 text-red-500" />
            <span class="truncate">
              {{ t('dashboard.todoRequired', { org: item.org, name: item.name }) }}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            :disabled="teamBusy === `${item.org}/${item.name}`"
            @click="runInstallRequired(item)"
          >
            {{ t('dashboard.todoRequiredAction') }}
          </Button>
        </li>
        <li
          v-for="item in updates"
          :key="`update-${item.org}/${item.name}`"
          class="flex items-center justify-between gap-3 rounded-md border px-4 py-2.5"
        >
          <span class="flex min-w-0 items-center gap-2 text-sm">
            <ArrowUpCircle class="size-4 shrink-0 text-sky-500" />
            <span class="truncate">
              {{
                t('dashboard.todoUpdate', {
                  org: item.org,
                  name: item.name,
                  remote: item.remoteVersion,
                  local: item.localVersion,
                })
              }}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            :disabled="teamBusy === `${item.org}/${item.name}`"
            @click="runUpgrade(item)"
          >
            {{ t('dashboard.todoUpdateAction') }}
          </Button>
        </li>
        <li
          v-for="s in driftSkills"
          :key="`drift-${s.name}`"
          class="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2.5"
        >
          <span class="flex min-w-0 items-center gap-2 text-sm">
            <TriangleAlert class="size-4 shrink-0 text-amber-500" />
            <span class="truncate">{{ t('dashboard.todoDrift', { name: s.name }) }}</span>
          </span>
          <Button variant="outline" size="sm" class="shrink-0" @click="emit('openSkill', s)">
            {{ t('dashboard.todoDriftAction') }}
            <ArrowRight />
          </Button>
        </li>
        <li
          v-for="s in singleEndSkills"
          :key="`single-${s.name}`"
          class="flex items-center justify-between gap-3 rounded-md border px-4 py-2.5"
        >
          <span class="flex min-w-0 items-center gap-2 text-sm">
            <PlatformIcon :id="s.installations[0]!.agent" :size="15" class="shrink-0" />
            <span class="truncate">
              {{
                t('dashboard.todoSingle', {
                  name: s.name,
                  agent: agentLabel(s.installations[0]!.agent),
                  n: otherAgentCount(s),
                })
              }}
            </span>
          </span>
          <Button variant="ghost" size="sm" class="shrink-0" @click="emit('openSkill', s)">
            {{ t('dashboard.todoSingleAction') }}
            <ArrowRight />
          </Button>
        </li>
      </ul>
    </section>

    <!-- marketplace discovery -->
    <MarketDiscovery />

    <!-- recent -->
    <section v-if="recentSkills.length > 0">
      <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('dashboard.recent') }}
      </h3>
      <ul class="flex flex-col gap-1.5">
        <li v-for="item in recentSkills" :key="item.skill.name">
          <button
            class="flex w-full items-center justify-between gap-3 rounded-md border px-4 py-2 text-left transition-colors hover:border-foreground/25"
            @click="emit('openSkill', item.skill)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm">{{ item.skill.name }}</span>
              <span class="flex shrink-0 items-center gap-1">
                <PlatformIcon
                  v-for="agent in new Set(item.skill.installations.map((i) => i.agent))"
                  :id="agent"
                  :key="agent"
                  :size="13"
                />
              </span>
            </span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ timeAgo(item.modifiedAt) }}
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
