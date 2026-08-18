<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  ExternalLink,
  KeyRound,
  Star,
} from '@lucide/vue'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import MarketFilesTab from '@/components/market/MarketFilesTab.vue'
import MarketVersionsTab from '@/components/market/MarketVersionsTab.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import {
  formatMarketCount,
  fetchMarketSkillSource,
  matchMarketSkill,
  marketIconColor,
  marketIconGlyph,
  type MarketItem,
} from '@/lib/market'
import { useSkills } from '@/composables/useSkills'
import { useSettings } from '@/composables/useSettings'
import { showToast } from '@/composables/useToast'

const props = defineProps<{ item: MarketItem; inset?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { installSkill, refresh } = useSkills()
const { groups } = useSettings()
const { t } = useI18n()

const iconBroken = shallowRef(false)
const targets = ref<InstallTarget[]>([])
const busy = shallowRef(false)
const error = shallowRef<string | null>(null)
const selectedGroups = ref<Set<string>>(new Set())

const overviewLoading = shallowRef(true)
const matched = shallowRef<FoundSkill | null>(null)
/** 缓存已下载的源码目录，供概览、文件标签和安装流程复用。 */
const sourceRoot = shallowRef<string | null>(null)

const overviewContent = computed(() => matched.value?.skill.content ?? null)
const groupSkillName = computed(() => matched.value?.skill.name ?? props.item.name)

function isGroupMember(name: string): boolean {
  return (
    groups.value.find((group) => group.name === name)?.skills.includes(groupSkillName.value) ??
    false
  )
}

function toggleGroup(name: string): void {
  if (isGroupMember(name)) return
  const next = new Set(selectedGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selectedGroups.value = next
}

/** 将 Skill 追加到用户选择的技能包中，不触发任何 Agent 安装。 */
function addToSelectedGroups(): void {
  if (selectedGroups.value.size === 0) return
  const skillName = groupSkillName.value
  let added = 0
  groups.value = groups.value.map((group) => {
    if (!selectedGroups.value.has(group.name) || group.skills.includes(skillName)) return group
    added += 1
    return { ...group, skills: [...group.skills, skillName] }
  })
  selectedGroups.value = new Set()
  if (added > 0) showToast({ message: t('market.addedToGroups', { n: added }) })
}

async function fetchSource(): Promise<{ root: string; items: FoundSkill[] }> {
  return fetchMarketSkillSource(props.item)
}

function matchSkill(items: FoundSkill[]): FoundSkill | undefined {
  return matchMarketSkill(props.item, items)
}

onMounted(async () => {
  try {
    const result = await fetchSource()
    sourceRoot.value = result.root
    matched.value = matchSkill(result.items) ?? null
  } catch {
  } finally {
    overviewLoading.value = false
  }
})

onUnmounted(() => {
  if (sourceRoot.value) void window.skillsManager.cleanupImport(sourceRoot.value)
})

type TabId = 'overview' | 'files' | 'versions'
const tab = shallowRef<TabId>('overview')

const tabs = computed(() => [
  { id: 'overview' as TabId, label: t('market.overview') },
  { id: 'files' as TabId, label: t('market.files') },
  ...(props.item.kind === 'skillhub'
    ? [{ id: 'versions' as TabId, label: t('market.versionHistory') }]
    : []),
])


function timeAgo(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000)
  if (min < 1) return t('dashboard.justNow')
  if (min < 60) return t('dashboard.minutesAgo', { n: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('dashboard.hoursAgo', { n: hours })
  return t('dashboard.daysAgo', { n: Math.floor(hours / 24) })
}

function openLink(): void {
  void window.skillsManager.openLink(props.item.link)
}

/** 优先复用概览源码；概览加载失败时重新下载，并在本次安装结束后清理临时目录。 */
async function install(): Promise<void> {
  if (targets.value.length === 0) return
  busy.value = true
  error.value = null
  let tempRoot: string | null = null
  try {
    let found = matched.value
    if (!found) {
      const result = await fetchSource()
      tempRoot = result.root
      found = matchSkill(result.items) ?? null
    }
    if (!found) {
      error.value = t('market.notFound')
      return
    }
    const results = await installSkill(found.skill, targets.value)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      error.value = failed.map((f) => `${agentLabel(f.target.agent)}: ${f.error}`).join('；')
      return
    }
    await refresh()
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (tempRoot) await window.skillsManager.cleanupImport(tempRoot)
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag cursor-pointer"
        @click="emit('close')"
      >
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="select-text min-w-0 truncate text-base font-semibold leading-5 tracking-tight">
        {{ item.name }}
      </h1>
      <div class="flex-1" />
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag cursor-pointer"
        @click="openLink"
      >
        <ExternalLink class="size-3.5" />
        {{ t('market.viewSource') }}
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <!-- hero -->
        <div class="flex items-start gap-5">
          <img
            v-if="item.icon && !iconBroken"
            :src="item.icon"
            class="size-16 shrink-0 rounded-2xl border object-cover"
            alt=""
            @error="iconBroken = true"
          />
          <span
            v-else
            :class="[
              'flex size-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white',
              marketIconColor(item.name),
            ]"
          >
            {{ marketIconGlyph(item.name) }}
          </span>
          <div class="flex min-w-0 flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <h2 class="select-text min-w-0 truncate text-2xl font-bold tracking-tight">
                {{ item.name }}
              </h2>
              <BadgeCheck
                v-if="item.verified"
                class="size-5 shrink-0 text-sky-500"
                :title="t('market.verified')"
              />
            </div>
            <button
              type="button"
              class="select-text w-fit max-w-full cursor-pointer truncate text-left text-sm text-muted-foreground underline-offset-2 hover:underline"
              :title="t('market.viewSource')"
              @click="openLink"
            >
              {{
                item.kind === 'skillhub'
                  ? item.sourceLabel.startsWith('@')
                    ? item.sourceLabel
                    : `@${item.sourceLabel}`
                  : item.sourceLabel
              }}
            </button>
            <div class="flex items-center gap-4 text-sm tabular-nums text-muted-foreground">
              <span
                v-if="item.installs > 0"
                class="flex items-center gap-1.5"
                :title="t('market.installs', { n: item.installs })"
              >
                <Download class="size-4" />
                {{ formatMarketCount(item.installs) }}
              </span>
              <span v-if="item.stars !== null" class="flex items-center gap-1.5" title="stars">
                <Star class="size-4" />
                {{ formatMarketCount(item.stars) }}
              </span>
            </div>
          </div>
        </div>

        <!-- description -->
        <p
          v-if="item.description.trim()"
          class="select-text text-sm leading-relaxed text-foreground/85"
        >
          {{ item.description }}
        </p>

        <!-- meta chips -->
        <div
          v-if="item.requiresApiKey || (item.tags?.length ?? 0) > 0 || item.updatedAt || item.version"
          class="flex flex-wrap items-center gap-2"
        >
          <span
            v-if="item.requiresApiKey"
            class="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-sm text-amber-700 dark:text-amber-400"
          >
            <KeyRound class="size-3" />
            {{ t('market.requiresApiKey') }}
          </span>
          <span
            v-for="tag in item.tags ?? []"
            :key="tag"
            class="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground"
          >
            {{ tag }}
          </span>
          <span
            v-if="item.updatedAt"
            class="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground"
          >
            {{ t('market.updated', { t: timeAgo(item.updatedAt) }) }}
          </span>
          <span
            v-if="item.version"
            class="rounded-full border px-2.5 py-0.5 text-sm tabular-nums text-muted-foreground"
          >
            v{{ item.version }}
          </span>
        </div>

        <!-- install -->
        <section class="flex flex-col gap-2 rounded-xl border bg-muted/20 px-5 py-4">
          <PlatformTargetPicker v-model="targets" :label="t('team.installTo')" />
          <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
          <Button
            class="mt-1 w-fit cursor-pointer"
            :disabled="busy || targets.length === 0"
            @click="install"
          >
            {{ busy ? t('market.installing') : t('detail.installN', { n: targets.length }) }}
          </Button>
        </section>

        <!-- skill packages -->
        <section class="flex flex-col gap-3 rounded-xl border px-5 py-4">
          <h3 class="text-sm font-medium">{{ t('market.addToGroups') }}</h3>
          <div v-if="groups.length > 0" class="flex flex-wrap gap-2">
            <button
              v-for="group in groups"
              :key="group.name"
              type="button"
              :disabled="isGroupMember(group.name)"
              :class="[
                'flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm transition-colors',
                isGroupMember(group.name)
                  ? 'cursor-default border-foreground/20 bg-muted text-muted-foreground'
                  : selectedGroups.has(group.name)
                    ? 'border-foreground bg-foreground text-background'
                    : 'hover:border-foreground/40',
              ]"
              @click="toggleGroup(group.name)"
            >
              {{ group.name }}
            </button>
          </div>
          <p v-else class="text-sm text-muted-foreground">
            {{ t('market.noGroups') }}
          </p>
          <Button
            v-if="groups.length > 0"
            variant="outline"
            class="w-fit cursor-pointer"
            :disabled="selectedGroups.size === 0"
            @click="addToSelectedGroups"
          >
            {{ t('market.addToGroupsAction', { n: selectedGroups.size }) }}
          </Button>
        </section>

        <!-- tabs -->
        <div class="flex items-center gap-6 border-b">
          <button
            v-for="tb in tabs"
            :key="tb.id"
            type="button"
            :class="[
              '-mb-px cursor-pointer border-b-2 pb-2 text-sm transition-colors',
              tab === tb.id
                ? 'border-foreground font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]"
            @click="tab = tb.id"
          >
            {{ tb.label }}
          </button>
        </div>

        <!-- overview tab -->
        <section v-show="tab === 'overview'">
          <div v-if="overviewLoading" class="flex flex-col gap-3 py-2">
            <Skeleton class="h-6 w-1/3" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-5/6" />
            <Skeleton class="mt-3 h-5 w-1/4" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-4/5" />
            <Skeleton class="mt-3 h-32 w-full rounded-lg" />
          </div>
          <MarkdownView
            v-else-if="overviewContent"
            :content="overviewContent"
            preview-id="market-overview"
            class="select-text"
          />
          <p v-else class="py-8 text-center text-sm text-muted-foreground">
            {{ t('market.overviewUnavailable') }}
          </p>
        </section>

        <MarketVersionsTab
          v-if="item.kind === 'skillhub'"
          v-show="tab === 'versions'"
          :active="tab === 'versions'"
          :item="item"
        />

        <MarketFilesTab
          v-show="tab === 'files'"
          :active="tab === 'files'"
          :matched="matched"
          :source-loading="overviewLoading"
        />
      </div>
    </ScrollArea>
  </div>
</template>
