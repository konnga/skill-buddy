<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import {
  Check,
  CloudDownload,
  FolderOpen,
  Import,
  Power,
  PowerOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import GroupPresetToolbar from '@/components/groups/GroupPresetToolbar.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import SkillCard from '@/components/SkillCard.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGroups } from '@/composables/useGroups'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'
import {
  manageableSkillInstallations,
  type SkillInstallation,
} from '@/lib/skill-installations'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{
  openSkill: [skill: AggregatedSkill]
  editSkill: [skill: AggregatedSkill]
  newSkill: []
  importSkills: []
}>()

const { t } = useI18n()
const {
  detectedPlatforms,
  loading,
  error,
  search,
  driftOnly,
  platformFilter,
  projectFilter,
  ownershipFilter,
  sortBy,
  filtered,
  skills,
  refresh,
  setEnabled,
} = useSkills()
const removing = ref<Set<string>>(new Set())
const toggling = ref<Set<string>>(new Set())
const selectedNames = ref<Set<string>>(new Set())
const batchBusy = ref(false)
type BatchAction = 'enable' | 'disable' | 'uninstall'
interface BatchItem {
  name: string
  targets: InstallTarget[]
  paths: string[]
}
const pendingBatch = ref<{ action: BatchAction; items: BatchItem[] } | null>(null)
const pendingUninstall = ref<{
  skill: AggregatedSkill
  platformId: string | null
  projectFilter: string | null
  installations: SkillInstallation[]
} | null>(null)
type ToggleContext = 'agent' | 'scope' | 'scopeAgent' | 'global'
const pendingToggle = ref<{
  skill: AggregatedSkill
  platformId: string | null
  enabled: boolean
  context: ToggleContext
  installations: SkillInstallation[]
} | null>(null)
const pendingUninstallCount = computed(
  () => pendingUninstall.value?.installations.length ?? 0,
)
const pendingUninstallIsScope = computed(
  () => Boolean(pendingUninstall.value?.projectFilter) && !pendingUninstall.value?.platformId,
)
const pendingUninstallIsScopeAgent = computed(
  () => Boolean(pendingUninstall.value?.projectFilter && pendingUninstall.value.platformId),
)
const {
  groupFilter,
  groupApplyOpen,
  groupApplyScope,
  groupApplyAgents,
  groupApplyBusy,
  groupApplyNote,
  activeTemp,
  activeGroupState,
  groupToggleBusy,
  groupCount,
  applyGroup,
  applyGroupTemp,
  endTemp,
  setGroupEnabled,
} = useGroups()

const sortOptions = computed(() => [
  { value: 'name', label: t('sort.name') },
  { value: 'recent', label: t('sort.recent') },
])

const ownershipModel = computed({
  get: () => ownershipFilter.value ?? 'all',
  set: (value: string) => {
    ownershipFilter.value = value === 'managed' || value === 'agent' ? value : null
  },
})

const ownershipOptions = computed(() => [
  { value: 'all', label: t('app.allSources') },
  { value: 'managed', label: t('app.managedByMe') },
  { value: 'agent', label: t('app.managedByAgent') },
])

const pendingToggleCopy = computed(() => {
  const request = pendingToggle.value
  if (!request) return { title: '', descriptionKey: '', action: '' }
  const action = request.enabled ? 'enable' : 'disable'
  const context =
    request.context === 'agent'
      ? 'Agent'
      : request.context === 'scope'
        ? 'Scope'
        : request.context === 'scopeAgent'
          ? 'ScopeAgent'
          : 'Global'
  const key = `card.${action}${context}`
  return {
    title: t(`${key}Title`),
    descriptionKey: `${key}Confirm`,
    action: t(`${key}Action`),
  }
})

const installationFilter = computed(() => ({
  platformId: platformFilter.value,
  projectFilter: projectFilter.value,
  ownershipFilter: ownershipFilter.value,
}))

const selectedSkills = computed(() =>
  filtered.value.filter((skill) => selectedNames.value.has(skill.name)),
)
const allVisibleSelected = computed(
  () => filtered.value.length > 0 && filtered.value.every((skill) => selectedNames.value.has(skill.name)),
)
const selectedTargetCount = computed(() =>
  selectedSkills.value.reduce(
    (count, skill) =>
      count + manageableSkillInstallations(skill, installationFilter.value).length,
    0,
  ),
)

watch(filtered, (items) => {
  const visible = new Set(items.map((skill) => skill.name))
  const next = new Set([...selectedNames.value].filter((name) => visible.has(name)))
  if (next.size !== selectedNames.value.size) selectedNames.value = next
})

function toggleSelected(name: string): void {
  const next = new Set(selectedNames.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selectedNames.value = next
}

function toggleSelectAll(): void {
  const next = new Set(selectedNames.value)
  if (allVisibleSelected.value) {
    for (const skill of filtered.value) next.delete(skill.name)
  } else {
    for (const skill of filtered.value) next.add(skill.name)
  }
  selectedNames.value = next
}

function clearSelection(): void {
  selectedNames.value = new Set()
}

function requestBatch(action: BatchAction): void {
  const items = selectedSkills.value
    .map((skill): BatchItem => {
      const installations = manageableSkillInstallations(skill, installationFilter.value)
      return {
        name: skill.name,
        targets: installations.map((installation) => ({
          agent: installation.agent,
          scope: installation.scope,
          projectRoot: installation.projectRoot,
        })),
        paths: installations.map((installation) => installation.path),
      }
    })
    .filter((item) => item.targets.length > 0)
  if (items.length === 0) return
  pendingBatch.value = { action, items }
}

const pendingBatchTitle = computed(() =>
  pendingBatch.value ? t(`batch.${pendingBatch.value.action}Title`) : '',
)
const pendingBatchDescription = computed(() => {
  const request = pendingBatch.value
  if (!request) return ''
  const installations = request.items.reduce((count, item) => count + item.targets.length, 0)
  return t(`batch.${request.action}Confirm`, {
    skills: request.items.length,
    installations,
  })
})
const pendingBatchAction = computed(() =>
  pendingBatch.value ? t(`batch.${pendingBatch.value.action}Action`) : '',
)

async function confirmBatch(): Promise<void> {
  const request = pendingBatch.value
  if (!request || batchBusy.value) return
  pendingBatch.value = null
  batchBusy.value = true
  try {
    if (request.action === 'uninstall') {
      const paths = [...new Set(request.items.flatMap((item) => item.paths))]
      const { token, results } = await window.skillsManager.trashUndoable(paths)
      const completed = results.filter((result) => result.ok).length
      const failed = results.length - completed
      if (completed > 0) {
        clearSelection()
        await refresh({ silent: true })
        showToast({
          message:
            failed > 0
              ? t('card.uninstallPartial', { completed, failed })
              : t('common.trashedN', { n: completed }),
          actionLabel: t('common.undo'),
          onAction: async () => {
            if (await window.skillsManager.undoTrash(token)) {
              await refresh({ silent: true })
              showToast({ message: t('common.restored') })
            }
          },
        })
      } else {
        showToast({ message: t('card.uninstallFailed') })
      }
      return
    }

    const enabled = request.action === 'enable'
    let completed = 0
    const failures: string[] = []
    for (const item of request.items) {
      const results = await setEnabled(item.name, item.targets, enabled, { refresh: false })
      completed += results.filter((result) => result.ok).length
      failures.push(...results.filter((result) => !result.ok).map((result) => result.error ?? ''))
    }
    await refresh({ silent: true })
    clearSelection()
    if (completed > 0) showToast({ message: t(`batch.${request.action}Done`, { n: completed }) })
    if (failures.length > 0) showToast({ message: failures.filter(Boolean).join('；') })
  } catch {
    showToast({ message: t('batch.failed') })
  } finally {
    batchBusy.value = false
  }
}

function updateBatchDialog(open: boolean): void {
  if (!open && !batchBusy.value) pendingBatch.value = null
}

async function uninstallSkill(request: NonNullable<typeof pendingUninstall.value>): Promise<void> {
  if (removing.value.has(request.skill.name)) return
  const paths = request.installations.map((installation) => installation.path)

  removing.value = new Set([...removing.value, request.skill.name])
  try {
    const { token, results } = await window.skillsManager.trashUndoable(paths)
    const completed = results.filter((result) => result.ok).length
    const failed = results.length - completed
    if (completed > 0) {
      await refresh({ silent: true })
      showToast({
        message:
          failed > 0
            ? t('card.uninstallPartial', { completed, failed })
            : t('common.trashedN', { n: completed }),
        actionLabel: t('common.undo'),
        onAction: async () => {
          if (await window.skillsManager.undoTrash(token)) {
            await refresh({ silent: true })
            showToast({ message: t('common.restored') })
          }
        },
      })
    } else {
      showToast({ message: t('card.uninstallFailed') })
    }
  } catch {
    showToast({ message: t('card.uninstallFailed') })
  } finally {
    const next = new Set(removing.value)
    next.delete(request.skill.name)
    removing.value = next
  }
}

async function confirmUninstall(): Promise<void> {
  const request = pendingUninstall.value
  if (!request) return
  await uninstallSkill(request)
  pendingUninstall.value = null
}

function requestUninstall(skill: AggregatedSkill, platformId: string | null): void {
  const scopeFilter = projectFilter.value
  const installations = manageableSkillInstallations(skill, {
    platformId,
    projectFilter: scopeFilter,
    ownershipFilter: ownershipFilter.value,
  })
  if (installations.length === 0) return
  pendingUninstall.value = { skill, platformId, projectFilter: scopeFilter, installations }
}

function updateUninstallDialog(open: boolean): void {
  if (
    !open &&
    pendingUninstall.value &&
    !removing.value.has(pendingUninstall.value.skill.name)
  ) {
    pendingUninstall.value = null
  }
}

async function toggleSkill(request: NonNullable<typeof pendingToggle.value>): Promise<void> {
  if (toggling.value.has(request.skill.name)) return

  toggling.value = new Set([...toggling.value, request.skill.name])
  try {
    const results = await setEnabled(
      request.skill.name,
      request.installations.map((installation) => ({
        agent: installation.agent,
        scope: installation.scope,
        projectRoot: installation.projectRoot,
      })),
      request.enabled,
    )
    const failed = results.filter((result) => !result.ok)
    const completed = results.length - failed.length
    if (completed > 0) {
      const message =
        request.context === 'agent'
          ? t(request.enabled ? 'card.enabledOnPlatform' : 'card.disabledOnPlatform', {
              platform: agentLabel(request.platformId ?? ''),
              n: completed,
            })
          : request.context === 'scopeAgent'
            ? t(
                request.enabled
                  ? 'card.enabledInScopeOnPlatform'
                  : 'card.disabledInScopeOnPlatform',
                {
                  platform: agentLabel(request.platformId ?? ''),
                  n: completed,
                },
              )
          : request.context === 'scope'
            ? t(request.enabled ? 'card.enabledInScope' : 'card.disabledInScope', {
                n: completed,
              })
            : t(request.enabled ? 'card.enabledN' : 'card.disabledN', { n: completed })
      showToast({
        message,
      })
    }
    if (failed.length > 0) {
      showToast({ message: failed.map((result) => result.error).join('；') })
    }
  } finally {
    const next = new Set(toggling.value)
    next.delete(request.skill.name)
    toggling.value = next
  }
}

function requestToggle(skill: AggregatedSkill): void {
  const targets = manageableSkillInstallations(skill, installationFilter.value)
  if (targets.length === 0) return
  const enabled = targets.every((installation) => installation.enabled === false)
  pendingToggle.value = {
    skill,
    platformId: platformFilter.value,
    enabled,
    context:
      projectFilter.value && platformFilter.value
        ? 'scopeAgent'
        : projectFilter.value
          ? 'scope'
          : platformFilter.value
            ? 'agent'
            : 'global',
    installations: targets,
  }
}

async function confirmToggle(): Promise<void> {
  const request = pendingToggle.value
  if (!request) return
  pendingToggle.value = null
  await toggleSkill(request)
}

function updateToggleDialog(open: boolean): void {
  if (!open && pendingToggle.value && !toggling.value.has(pendingToggle.value.skill.name)) {
    pendingToggle.value = null
  }
}
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
      <div class="app-no-drag relative w-64">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="search" :placeholder="t('app.searchPlaceholder')" class="h-8 pl-8" />
      </div>
      <Select v-model="ownershipModel" class="app-no-drag" :options="ownershipOptions" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        :aria-pressed="driftOnly"
        :class="[
          'app-no-drag cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5',
          driftOnly
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400'
            : 'text-foreground hover:border-foreground/40 hover:bg-background',
        ]"
        @click="driftOnly = !driftOnly"
      >
        <TriangleAlert class="size-3.5" />
        {{ t('app.driftOnly') }}
      </Button>
      <Select v-model="sortBy" class="app-no-drag" :options="sortOptions" />
      <Button
        v-if="filtered.length > 0"
        variant="ghost"
        size="sm"
        class="app-no-drag cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5"
        :disabled="batchBusy"
        @click="toggleSelectAll"
      >
        <Check class="size-3.5" />
        {{ t(allVisibleSelected ? 'batch.clear' : 'batch.selectAll') }}
      </Button>
      <Button
        v-if="groupFilter"
        variant="outline"
        size="sm"
        class="app-no-drag"
        @click="groupApplyOpen = !groupApplyOpen"
      >
        <CloudDownload class="size-3.5" />
        {{ t('groups.applyTitle') }}
      </Button>
      <div class="flex-1" />
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('newSkill')">
        <Plus />
      </Button>
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('importSkills')">
        <Import />
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

    <ScrollArea class="flex-1" viewport-class="px-6 py-5">
      <GroupPresetToolbar
        v-if="groupFilter && activeGroupState"
        :state="activeGroupState"
        :busy="groupToggleBusy"
        @enable="setGroupEnabled(true)"
        @disable="setGroupEnabled(false)"
      />

      <div
        v-if="groupFilter && groupApplyOpen"
        class="mb-4 flex flex-col gap-2 rounded-lg border px-4 py-3"
      >
        <PlatformTargetPicker
          v-model:scope="groupApplyScope"
          v-model:agents="groupApplyAgents"
          :label="t('groups.applyTitle')"
        />
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            :disabled="groupApplyBusy || groupApplyAgents.length === 0 || groupCount(groupFilter) === 0"
            @click="applyGroup"
          >
            {{
              groupApplyBusy
                ? t('detail.installing')
                : t('groups.apply', { n: groupCount(groupFilter) })
            }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="groupApplyBusy || groupApplyAgents.length === 0 || groupCount(groupFilter) === 0"
            @click="applyGroupTemp"
          >
            {{ t('groups.applyTemp') }}
          </Button>
        </div>
        <p class="text-sm text-muted-foreground">{{ t('groups.tempHint') }}</p>
        <p v-if="groupApplyNote" class="text-sm text-amber-600 dark:text-amber-400">
          {{ groupApplyNote }}
        </p>
      </div>

      <div
        v-if="groupFilter && activeTemp"
        class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5"
      >
        <span class="text-sm text-sky-700 dark:text-sky-400">
          {{ t('groups.tempActive', { n: activeTemp.installed.length }) }}
        </span>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0"
          :disabled="groupApplyBusy"
          @click="endTemp(groupFilter)"
        >
          {{ t('groups.endTemp') }}
        </Button>
      </div>

      <div
        v-if="selectedSkills.length > 0"
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3"
      >
        <div class="flex items-center gap-2 text-sm">
          <span class="font-medium">{{ t('batch.selected', { n: selectedSkills.length }) }}</span>
          <span class="text-muted-foreground">
            {{ t('batch.targets', { n: selectedTargetCount }) }}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="cursor-pointer"
            :disabled="batchBusy || selectedTargetCount === 0"
            @click="requestBatch('enable')"
          >
            <Power class="size-3.5" />
            {{ t('batch.enable') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="cursor-pointer"
            :disabled="batchBusy || selectedTargetCount === 0"
            @click="requestBatch('disable')"
          >
            <PowerOff class="size-3.5" />
            {{ t('batch.disable') }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="cursor-pointer"
            :disabled="batchBusy || selectedTargetCount === 0"
            @click="requestBatch('uninstall')"
          >
            <Trash2 class="size-3.5" />
            {{ t('batch.uninstall') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="batchBusy"
            @click="clearSelection"
          >
            {{ t('batch.clearSelection') }}
          </Button>
        </div>
      </div>

      <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.scanning') }}
      </div>
      <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>
      <div
        v-else-if="skills.length === 0"
        class="flex flex-col items-center gap-3 py-24 text-muted-foreground"
      >
        <FolderOpen class="size-10" />
        <p class="text-sm">{{ t('app.empty') }}</p>
        <p class="max-w-sm text-center text-sm">
          {{ t('app.emptyHint', { n: detectedPlatforms.length }) }}
        </p>
      </div>
      <div v-else-if="filtered.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.noMatch', { q: search }) }}
      </div>
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SkillCard
          v-for="skill in filtered"
          :key="skill.name"
          :skill="skill"
          :busy="removing.has(skill.name) || toggling.has(skill.name)"
          :selected="selectedNames.has(skill.name)"
          :current-platform="platformFilter ?? undefined"
          :scope-filter="
            projectFilter ? (projectFilter === 'user' ? 'user' : 'project') : undefined
          "
          :project-root="
            projectFilter && projectFilter !== 'user' ? projectFilter : undefined
          "
          :ownership-filter="ownershipFilter ?? undefined"
          @open="emit('openSkill', skill)"
          @edit="emit('editSkill', skill)"
          @toggle-selected="toggleSelected(skill.name)"
          @toggle-enabled="requestToggle(skill)"
          @uninstall-current="requestUninstall(skill, platformFilter)"
          @uninstall-all="requestUninstall(skill, null)"
        />
      </div>
    </ScrollArea>

    <DialogRoot
      :open="Boolean(pendingUninstall)"
      @update:open="updateUninstallDialog"
    >
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">
            {{
              pendingUninstallIsScope
                ? t('card.uninstallScopeTitle')
                : pendingUninstallIsScopeAgent
                  ? t('card.uninstallScopeAgentTitle')
                : pendingUninstall?.platformId
                ? t('card.uninstallCurrentTitle')
                : t('card.uninstallAllTitle')
            }}
          </DialogTitle>
          <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
            <I18nT
              :keypath="
                pendingUninstallIsScope
                  ? 'card.uninstallScopeConfirm'
                  : pendingUninstallIsScopeAgent
                    ? 'card.uninstallScopeAgentConfirm'
                  : pendingUninstall?.platformId
                  ? 'card.uninstallCurrentConfirm'
                  : 'card.uninstallAllConfirm'
              "
              tag="span"
            >
              <template #name>
                <strong class="font-semibold text-foreground">
                  {{ pendingUninstall?.skill.name }}
                </strong>
              </template>
              <template #platform>
                <strong class="font-semibold text-foreground">
                  {{ pendingUninstall?.platformId ? agentLabel(pendingUninstall.platformId) : '' }}
                </strong>
              </template>
              <template #n>{{ pendingUninstallCount }}</template>
            </I18nT>
          </DialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              :disabled="Boolean(pendingUninstall && removing.has(pendingUninstall.skill.name))"
              @click="pendingUninstall = null"
            >
              {{ t('common.cancel') }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="Boolean(pendingUninstall && removing.has(pendingUninstall.skill.name))"
              @click="confirmUninstall"
            >
              {{
                pendingUninstallIsScope
                  ? t('card.uninstallScopeAction')
                  : pendingUninstallIsScopeAgent
                    ? t('card.uninstallScopeAgentAction')
                  : pendingUninstall?.platformId
                  ? t('card.uninstallCurrentAction')
                  : t('card.uninstallAllAction')
              }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="Boolean(pendingToggle)" @update:open="updateToggleDialog">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">
            {{ pendingToggleCopy.title }}
          </DialogTitle>
          <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
            <I18nT :keypath="pendingToggleCopy.descriptionKey" tag="span">
              <template #name>
                <strong class="font-semibold text-foreground">
                  {{ pendingToggle?.skill.name }}
                </strong>
              </template>
              <template #platform>
                <strong class="font-semibold text-foreground">
                  {{ pendingToggle?.platformId ? agentLabel(pendingToggle.platformId) : '' }}
                </strong>
              </template>
              <template #n>{{ pendingToggle?.installations.length ?? 0 }}</template>
            </I18nT>
          </DialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="pendingToggle = null">
              {{ t('common.cancel') }}
            </Button>
            <Button size="sm" @click="confirmToggle">
              {{ pendingToggleCopy.action }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="Boolean(pendingBatch)" @update:open="updateBatchDialog">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">{{ pendingBatchTitle }}</DialogTitle>
          <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
            {{ pendingBatchDescription }}
          </DialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              :disabled="batchBusy"
              @click="pendingBatch = null"
            >
              {{ t('common.cancel') }}
            </Button>
            <Button
              :variant="pendingBatch?.action === 'uninstall' ? 'destructive' : 'default'"
              size="sm"
              :disabled="batchBusy"
              @click="confirmBatch"
            >
              {{ pendingBatchAction }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
