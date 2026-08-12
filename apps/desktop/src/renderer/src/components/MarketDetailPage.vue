<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Folder,
  KeyRound,
  ShieldCheck,
  Star,
} from '@lucide/vue'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import {
  formatMarketCount,
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

const scope = ref('user')
const iconBroken = ref(false)
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const selectedGroups = ref<Set<string>>(new Set())

/* ---------- source download (shared by overview / files / install) ---------- */

const overviewLoading = ref(true)
const matched = ref<FoundSkill | null>(null)
/** downloaded source root, kept alive so install() can reuse it */
const sourceRoot = ref<string | null>(null)

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
  const item = props.item
  return item.kind === 'skills-sh' || item.kind === 'github'
    ? await window.skillsManager.importFromGit(`https://github.com/${item.repo}`)
    : await window.skillsManager.skillhubFetch(item.slug!, item.namespace ?? '')
}

function matchSkill(items: FoundSkill[]): FoundSkill | undefined {
  const item = props.item
  const wanted =
    item.kind === 'skills-sh' ? item.skillId! : item.kind === 'skillhub' ? item.slug! : item.name
  return (
    items.find((f) => f.skill.name === wanted) ??
    items.find((f) => f.dir.endsWith(`/${wanted}`)) ??
    (item.kind !== 'skills-sh' ? items[0] : undefined)
  )
}

onMounted(async () => {
  try {
    const result = await fetchSource()
    sourceRoot.value = result.root
    matched.value = matchSkill(result.items) ?? null
  } catch {
    // overview is best-effort; install() retries the download itself
  } finally {
    overviewLoading.value = false
  }
})

onUnmounted(() => {
  if (sourceRoot.value) void window.skillsManager.cleanupImport(sourceRoot.value)
})

/* ---------- tabs ---------- */

type TabId = 'overview' | 'files' | 'versions'
const tab = ref<TabId>('overview')

const tabs = computed(() => [
  { id: 'overview' as TabId, label: t('market.overview') },
  { id: 'files' as TabId, label: t('market.files') },
  // version history is a SkillHub-only API
  ...(props.item.kind === 'skillhub'
    ? [{ id: 'versions' as TabId, label: t('market.versionHistory') }]
    : []),
])

/* ---------- versions tab (SkillHub only) ---------- */

interface VersionEntry {
  version: string
  changelog: string
  createdAt: number | null
  security: { name: string; status: string; statusText: string; reportUrl: string }[]
}

const versions = ref<VersionEntry[] | null>(null)
const versionsLoading = ref(false)

async function loadVersions(): Promise<void> {
  if (versions.value || versionsLoading.value || props.item.kind !== 'skillhub') return
  versionsLoading.value = true
  try {
    versions.value = await window.skillsManager.skillhubVersions(
      props.item.slug!,
      props.item.namespace ?? '',
    )
  } catch {
    versions.value = []
  } finally {
    versionsLoading.value = false
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function openReport(url: string): void {
  if (url) void window.skillsManager.openLink(url)
}

/* ---------- files tab ---------- */

interface TreeEntry {
  path: string
  size: number
  isDir: boolean
}

interface TreeNode extends TreeEntry {
  name: string
  children: TreeNode[]
}

const treeEntries = ref<TreeEntry[] | null>(null)
const treeLoading = ref(false)
const expanded = ref<Set<string>>(new Set())

const fileCount = computed(() => (treeEntries.value ?? []).filter((e) => !e.isDir).length)

const tree = computed<TreeNode[]>(() => {
  const root: TreeNode[] = []
  const byPath = new Map<string, TreeNode>()
  for (const e of treeEntries.value ?? []) {
    const node: TreeNode = { ...e, name: e.path.split('/').pop()!, children: [] }
    byPath.set(e.path, node)
    const slash = e.path.lastIndexOf('/')
    const parent = slash > 0 ? byPath.get(e.path.slice(0, slash)) : undefined
    ;(parent ? parent.children : root).push(node)
  }
  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
    )
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(root)
  return root
})

const visibleRows = computed(() => {
  const rows: { node: TreeNode; depth: number }[] = []
  const walk = (nodes: TreeNode[], depth: number): void => {
    for (const n of nodes) {
      rows.push({ node: n, depth })
      if (n.isDir && expanded.value.has(n.path)) walk(n.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return rows
})

function toggleDir(path: string): void {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

async function loadTree(): Promise<void> {
  if (treeEntries.value || treeLoading.value || !matched.value) return
  treeLoading.value = true
  try {
    treeEntries.value = await window.skillsManager.listTree(matched.value.dir)
  } catch {
    treeEntries.value = []
  } finally {
    treeLoading.value = false
  }
}

watch([tab, matched], () => {
  if (tab.value === 'files') void loadTree()
  if (tab.value === 'versions') void loadVersions()
})

/* ---------- file preview ---------- */

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'icns', 'bmp',
  'zip', 'gz', 'tar', 'bz2', '7z', 'pdf',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'wasm', 'node', 'dylib', 'so', 'dll',
])

const openedFile = ref<{ path: string; size: number } | null>(null)
const fileContent = ref<string | null>(null)
const fileTruncated = ref(false)
const fileLoading = ref(false)

const openedIsMarkdown = computed(
  () => openedFile.value?.path.toLowerCase().endsWith('.md') ?? false,
)
const openedIsBinary = computed(() => {
  const ext = openedFile.value?.path.split('.').pop()?.toLowerCase()
  return ext ? BINARY_EXT.has(ext) : false
})

async function openFile(node: TreeNode): Promise<void> {
  openedFile.value = { path: node.path, size: node.size }
  fileContent.value = null
  fileTruncated.value = false
  if (openedIsBinary.value || !matched.value) return
  fileLoading.value = true
  try {
    const result = await window.skillsManager.readFile(`${matched.value.dir}/${node.path}`)
    fileContent.value = result.content
    fileTruncated.value = result.truncated
  } catch {
    fileContent.value = null
  } finally {
    fileLoading.value = false
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/* ---------- meta ---------- */

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

/* ---------- install ---------- */

async function install(): Promise<void> {
  if (agents.value.length === 0) return
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
    const targets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const results = await installSkill(found.skill, targets)
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
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="select-text min-w-0 truncate text-base font-semibold leading-5 tracking-tight">
        {{ item.name }}
      </h1>
      <div class="flex-1" />
      <Button variant="outline" size="sm" class="app-no-drag" @click="openLink">
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
              class="select-text w-fit max-w-full truncate text-left text-sm text-muted-foreground underline-offset-2 hover:underline"
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
          <PlatformTargetPicker
            v-model:scope="scope"
            v-model:agents="agents"
            :label="t('team.installTo')"
          />
          <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
          <Button
            class="mt-1 w-fit"
            :disabled="busy || agents.length === 0"
            @click="install"
          >
            {{ busy ? t('market.installing') : t('detail.installN', { n: agents.length }) }}
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
            :class="[
              '-mb-px border-b-2 pb-2 text-sm transition-colors',
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
        <section v-if="tab === 'overview'">
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

        <!-- versions tab -->
        <section v-else-if="tab === 'versions'">
          <div v-if="versionsLoading || versions === null" class="flex flex-col py-2">
            <div v-for="i in 3" :key="i" :class="['flex flex-col gap-2 py-4', i > 1 && 'border-t']">
              <div class="flex items-center gap-3">
                <Skeleton class="h-4 w-16" />
                <div class="flex-1" />
                <Skeleton class="h-3 w-20" />
              </div>
              <Skeleton class="h-4 w-2/3" />
              <div class="flex gap-2">
                <Skeleton class="h-5 w-24 rounded-full" />
                <Skeleton class="h-5 w-24 rounded-full" />
              </div>
            </div>
          </div>
          <p
            v-else-if="versions.length === 0"
            class="py-8 text-center text-sm text-muted-foreground"
          >
            {{ t('market.versionsEmpty') }}
          </p>
          <ul v-else class="flex flex-col">
            <li
              v-for="(v, i) in versions"
              :key="v.version"
              :class="['flex flex-col gap-1.5 py-4', i > 0 && 'border-t']"
            >
              <div class="flex items-center gap-3">
                <span class="text-sm font-semibold tabular-nums">v{{ v.version }}</span>
                <span
                  v-if="i === 0"
                  class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
                >
                  {{ t('market.latest') }}
                </span>
                <div class="flex-1" />
                <span v-if="v.createdAt" class="text-sm tabular-nums text-muted-foreground">
                  {{ formatDate(v.createdAt) }}
                </span>
              </div>
              <p v-if="v.changelog" class="select-text text-sm text-foreground/80">
                {{ v.changelog }}
              </p>
              <div v-if="v.security.length > 0" class="flex flex-wrap items-center gap-2">
                <button
                  v-for="report in v.security"
                  :key="report.name"
                  :class="[
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    report.status === 'benign'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground',
                    report.reportUrl ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                  ]"
                  :title="report.reportUrl ? t('market.viewReport') : undefined"
                  @click="openReport(report.reportUrl)"
                >
                  <ShieldCheck v-if="report.status === 'benign'" class="size-3" />
                  {{ report.name }} · {{ report.statusText || report.status }}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- files tab -->
        <section v-else>
          <div
            v-if="treeLoading || (overviewLoading && !treeEntries)"
            class="overflow-hidden rounded-xl border"
          >
            <div class="border-b bg-muted/20 px-4 py-2.5">
              <Skeleton class="h-4 w-24" />
            </div>
            <div class="flex flex-col gap-1 px-4 py-2">
              <div v-for="i in 8" :key="i" class="flex items-center gap-2 py-1.5">
                <Skeleton class="size-4 shrink-0 rounded" />
                <Skeleton :class="['h-4', i % 3 === 0 ? 'w-2/5' : i % 2 === 0 ? 'w-1/3' : 'w-1/4']" />
                <div class="flex-1" />
                <Skeleton v-if="i % 3 !== 1" class="h-3 w-12" />
              </div>
            </div>
          </div>

          <!-- file preview -->
          <div v-else-if="openedFile" class="flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <Button variant="outline" size="sm" @click="openedFile = null">
                <ArrowLeft class="size-3.5" />
                {{ t('market.backToFiles') }}
              </Button>
              <span class="min-w-0 truncate text-sm font-medium">{{ openedFile.path }}</span>
              <span class="shrink-0 text-sm tabular-nums text-muted-foreground">
                {{ formatSize(openedFile.size) }}
              </span>
            </div>
            <p
              v-if="fileTruncated"
              class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400"
            >
              {{ t('market.fileTruncated') }}
            </p>
            <div v-if="fileLoading" class="flex flex-col gap-2.5 py-2">
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-11/12" />
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-3/4" />
              <Skeleton class="h-4 w-5/6" />
            </div>
            <p
              v-else-if="openedIsBinary || fileContent === null"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t('market.previewUnsupported') }}
            </p>
            <MarkdownView
              v-else-if="openedIsMarkdown"
              :content="fileContent"
              preview-id="market-file"
              class="select-text"
            />
            <ScrollArea
              v-else
              orientation="both"
              class="max-h-[32rem] rounded-lg border bg-muted/30"
              viewport-class="max-h-[32rem]"
            >
              <pre class="select-text px-4 py-3 text-sm leading-relaxed">{{ fileContent }}</pre>
            </ScrollArea>
          </div>

          <!-- file tree -->
          <div v-else class="overflow-hidden rounded-xl border">
            <div class="border-b bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
              {{ t('market.filesCount', { n: fileCount }) }}
            </div>
            <ul class="py-1">
              <li v-for="row in visibleRows" :key="row.node.path">
                <button
                  class="flex w-full items-center gap-2 py-1.5 pr-4 text-sm transition-colors hover:bg-accent/50"
                  :style="{ paddingLeft: `${16 + row.depth * 20}px` }"
                  @click="row.node.isDir ? toggleDir(row.node.path) : openFile(row.node)"
                >
                  <component
                    :is="expanded.has(row.node.path) ? ChevronDown : ChevronRight"
                    v-if="row.node.isDir"
                    class="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span v-else class="w-3.5 shrink-0" />
                  <component
                    :is="row.node.isDir ? Folder : FileText"
                    class="size-4 shrink-0 text-muted-foreground"
                  />
                  <span class="min-w-0 flex-1 truncate text-left">{{ row.node.name }}</span>
                  <span
                    v-if="!row.node.isDir"
                    class="shrink-0 text-sm tabular-nums text-muted-foreground"
                  >
                    {{ formatSize(row.node.size) }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
