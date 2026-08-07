<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpCircle,
  ShieldAlert,
  TriangleAlert,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'
import { installRequired, upgradeSkill, useTeam } from '@/composables/useTeam'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ close: []; openSkill: [skill: AggregatedSkill] }>()

const { skills, detectedPlatforms } = useSkills()
const { updates, missingRequired } = useTeam()
const { t } = useI18n()

const teamBusy = ref<string | null>(null)

const driftSkills = computed(() => skills.value.filter((s) => s.hasDrift))

/** Skills installed on exactly one platform while others are available. */
const singleEndSkills = computed(() =>
  skills.value.filter((s) => {
    const agents = new Set(s.installations.map((i) => i.agent))
    return agents.size === 1 && detectedPlatforms.value.length > 1
  }),
)

const todoCount = computed(
  () =>
    driftSkills.value.length +
    singleEndSkills.value.length +
    updates.value.length +
    missingRequired.value.length,
)

const recentSkills = computed(() =>
  [...skills.value]
    .map((s) => ({
      skill: s,
      modifiedAt: Math.max(...s.installations.map((i) => i.modifiedAt ?? 0)),
    }))
    .filter((s) => s.modifiedAt > 0)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, 20),
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

function otherAgentCount(s: AggregatedSkill): number {
  const agents = new Set(s.installations.map((i) => i.agent))
  return detectedPlatforms.value.filter((p) => !agents.has(p.id)).length
}

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
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex items-center gap-3 border-b px-6 py-3', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft />
      </Button>
      <h1 class="text-base font-semibold tracking-tight">{{ t('dashboard.todo') }}</h1>
      <Badge v-if="todoCount > 0" variant="secondary" class="text-[10px]">{{ todoCount }}</Badge>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-6">
        <!-- needs attention -->
        <section>
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('dashboard.todo') }}
          </h3>
          <p
            v-if="todoCount === 0"
            class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
          >
            {{ t('dashboard.todoEmpty') }}
          </p>
          <ul v-else class="flex flex-col gap-2">
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

        <!-- recently modified -->
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
    </div>
  </div>
</template>
