<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import {
  ArrowLeft,
  Check,
  CloudDownload,
  Copy,
  Ellipsis,
  FolderPlus,
  FolderOpen,
  Import,
  Layers,
  LayoutGrid,
  ListTree,
  ListPlus,
  Pencil,
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
import PlatformIcon from '@/components/PlatformIcon.vue'
import GroupEmptyState from '@/components/groups/GroupEmptyState.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import SkillAgentTree from '@/components/SkillAgentTree.vue'
import SkillCard from '@/components/SkillCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useGroups } from '@/composables/useGroups'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'
import { pathBasename } from '@/lib/paths'
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
  navigate: [view: 'groups']
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
  installSkill,
  setEnabled,
} = useSkills()
const { projectRoots } = useSettings()
const removing = ref<Set<string>>(new Set())
const toggling = ref<Set<string>>(new Set())
const batchMode = shallowRef(false)
type SkillViewMode = 'grid' | 'tree'
let storedViewMode: unknown
try {
  storedViewMode = JSON.parse(localStorage.getItem('skm.skillsViewMode') ?? 'null')
} catch {
  storedViewMode = null
}
const viewMode = shallowRef<SkillViewMode>(storedViewMode === 'tree' ? 'tree' : 'grid')
const selectedNames = ref<Set<string>>(new Set())
const batchBusy = ref(false)
const batchProjectOpen = shallowRef(false)
const batchProjectRoot = shallowRef('')
const batchProjectAgents = ref<string[]>([])
const batchGroupOpen = shallowRef(false)
const batchGroupNames = ref<Set<string>>(new Set())
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
  groups,
  groupApplyOpen,
  groupApplyScope,
  groupApplyAgents,
  groupApplyBusy,
  groupApplyNote,
  activeTemp,
  activeGroupState,
  groupToggleBusy,
  groupCount,
  filterGroup,
  renameGroup,
  deleteGroup,
  exportGroup,
  setGroupSkills,
  applyGroup,
  applyGroupTemp,
  endTemp,
  setGroupEnabledFor,
} = useGroups()
const activeGroupEmpty = computed(() => activeGroupState.value?.totalSkills === 0)
const activeGroup = computed(() => groups.value.find((group) => group.name === groupFilter.value))
const renameOpen = shallowRef(false)
const renameValue = ref('')
const memberEditorOpen = shallowRef(false)
const memberSearch = ref('')
const draftMemberNames = ref<Set<string>>(new Set())
const renameDuplicate = computed(() => {
  const name = renameValue.value.trim()
  return Boolean(
    name && name !== groupFilter.value && groups.value.some((group) => group.name === name),
  )
})
const groupStatusVariant = computed(() => {
  if (activeGroupState.value?.status === 'enabled') return 'success' as const
  if (activeGroupState.value?.status === 'partial') return 'default' as const
  return 'secondary' as const
})
const cannotManageGroup = computed(
  () => groupToggleBusy.value || (activeGroupState.value?.manageableInstallations ?? 0) === 0,
)
const memberEditorSkills = computed(() => {
  const query = memberSearch.value.trim().toLowerCase()
  if (!query) return skills.value
  return skills.value.filter((skill) =>
    [skill.name, skill.description, ...skill.tags].some((field) =>
      field.toLowerCase().includes(query),
    ),
  )
})
const memberEditorMissingNames = computed(() => {
  const query = memberSearch.value.trim().toLowerCase()
  const localNames = new Set(skills.value.map((skill) => skill.name))
  return (activeGroup.value?.skills ?? []).filter(
    (name) => !localNames.has(name) && (!query || name.toLowerCase().includes(query)),
  )
})

/** 返回技能包列表并结束当前技能包的筛选上下文。 */
function backToGroups(): void {
  filterGroup(null)
  emit('navigate', 'groups')
}

function openRenameGroup(): void {
  if (!groupFilter.value) return
  renameValue.value = groupFilter.value
  renameOpen.value = true
}

function submitRenameGroup(): void {
  if (!groupFilter.value || renameDuplicate.value) return
  if (renameGroup(groupFilter.value, renameValue.value)) renameOpen.value = false
}

async function removeActiveGroup(): Promise<void> {
  const name = groupFilter.value
  if (!name) return
  await deleteGroup(name)
  if (groupFilter.value === null) emit('navigate', 'groups')
}

function exportActiveGroup(): void {
  if (activeGroup.value) void exportGroup(activeGroup.value)
}

function setActiveGroupEnabled(enabled: boolean): void {
  const name = groupFilter.value
  if (name) void setGroupEnabledFor(name, enabled)
}

/** 打开成员管理器，并以当前技能包成员作为编辑草稿。 */
function openMemberEditor(): void {
  if (!activeGroup.value) return
  memberSearch.value = ''
  draftMemberNames.value = new Set(activeGroup.value.skills)
  memberEditorOpen.value = true
}

function toggleDraftMember(name: string): void {
  const next = new Set(draftMemberNames.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  draftMemberNames.value = next
}

function saveGroupMembers(): void {
  const group = activeGroup.value
  if (!group) return

  const existingMembers = group.skills.filter((name) => draftMemberNames.value.has(name))
  const addedMembers = skills.value
    .map((skill) => skill.name)
    .filter((name) => draftMemberNames.value.has(name) && !group.skills.includes(name))
  if (setGroupSkills(group.name, [...existingMembers, ...addedMembers])) {
    memberEditorOpen.value = false
  }
}

function removeSkillFromActiveGroup(name: string): void {
  const group = activeGroup.value
  if (!group) return
  setGroupSkills(group.name, group.skills.filter((skillName) => skillName !== name))
}

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
const projectCapablePlatforms = computed(() =>
  detectedPlatforms.value.filter((platform) => platform.hasProjectScope),
)
const projectOptions = computed(() =>
  projectRoots.value.map((root) => ({ value: root, label: pathBasename(root) })),
)
const busySkillNames = computed(
  () => new Set([...removing.value, ...toggling.value]),
)

watch(viewMode, (value) => localStorage.setItem('skm.skillsViewMode', JSON.stringify(value)))

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

function handleBatchModeChange(enabled: boolean): void {
  if (!enabled) clearSelection()
}

function openBatchProject(): void {
  batchProjectRoot.value = projectRoots.value[0] ?? ''
  batchProjectAgents.value = projectCapablePlatforms.value.map((platform) => platform.id)
  batchProjectOpen.value = true
}

function toggleBatchProjectAgent(id: string): void {
  batchProjectAgents.value = batchProjectAgents.value.includes(id)
    ? batchProjectAgents.value.filter((agent) => agent !== id)
    : [...batchProjectAgents.value, id]
}

async function addSelectedToProject(): Promise<void> {
  if (!batchProjectRoot.value || batchProjectAgents.value.length === 0 || batchBusy.value) return
  batchBusy.value = true
  try {
    let completed = 0
    const failures: string[] = []
    for (const skill of selectedSkills.value) {
      const targets: InstallTarget[] = batchProjectAgents.value
        .filter(
          (agent) =>
            !skill.installations.some(
              (installation) =>
                installation.agent === agent &&
                installation.scope === 'project' &&
                installation.projectRoot === batchProjectRoot.value,
            ),
        )
        .map((agent) => ({
          agent,
          scope: 'project' as const,
          projectRoot: batchProjectRoot.value,
        }))
      if (targets.length === 0) continue
      const results = await installSkill(skill.installations[0]!.skill, targets, { refresh: false })
      completed += results.filter((result) => result.ok).length
      failures.push(
        ...results
          .filter((result) => !result.ok)
          .map((result) => `${skill.name}: ${result.error ?? ''}`),
      )
    }
    await refresh({ silent: true })
    batchProjectOpen.value = false
    clearSelection()
    showToast({ message: t('batch.addProjectDone', { n: completed }) })
    if (failures.length > 0) showToast({ message: failures.filter(Boolean).join('；') })
  } catch {
    showToast({ message: t('batch.failed') })
  } finally {
    batchBusy.value = false
  }
}

function openBatchGroups(): void {
  batchGroupNames.value = new Set()
  batchGroupOpen.value = true
}

function toggleBatchGroup(name: string): void {
  const next = new Set(batchGroupNames.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  batchGroupNames.value = next
}

function addSelectedToGroups(): void {
  if (batchGroupNames.value.size === 0) return
  const names = selectedSkills.value.map((skill) => skill.name)
  let added = 0
  groups.value = groups.value.map((group) => {
    if (!batchGroupNames.value.has(group.name)) return group
    const nextSkills = [...new Set([...group.skills, ...names])]
    added += nextSkills.length - group.skills.length
    return { ...group, skills: nextSkills }
  })
  batchGroupOpen.value = false
  clearSelection()
  showToast({ message: t('batch.addGroupsDone', { n: added }) })
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

function requestUninstall(
  skill: AggregatedSkill,
  platformId: string | null,
  requestedProjectFilter: string | null = projectFilter.value,
): void {
  const scopeFilter = requestedProjectFilter
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

function requestToggle(
  skill: AggregatedSkill,
  requestedPlatformId: string | null = platformFilter.value,
  requestedProjectFilter: string | null = projectFilter.value,
): void {
  const targets = manageableSkillInstallations(skill, {
    platformId: requestedPlatformId,
    projectFilter: requestedProjectFilter,
    ownershipFilter: ownershipFilter.value,
  })
  if (targets.length === 0) return
  const enabled = targets.every((installation) => installation.enabled === false)
  pendingToggle.value = {
    skill,
    platformId: requestedPlatformId,
    enabled,
    context:
      requestedProjectFilter && requestedPlatformId
        ? 'scopeAgent'
        : requestedProjectFilter
          ? 'scope'
          : requestedPlatformId
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

watch(groupFilter, (name) => {
  if (name) {
    batchMode.value = false
    clearSelection()
    pendingBatch.value = null
  } else {
    memberEditorOpen.value = false
  }
})
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 py-2',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <template v-if="groupFilter && activeGroupState">
        <div class="app-no-drag flex min-w-0 flex-1 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="-ml-2 size-8 shrink-0 cursor-pointer"
            :title="t('groups.backToList')"
            :aria-label="t('groups.backToList')"
            @click="backToGroups"
          >
            <ArrowLeft />
          </Button>
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <h1 class="truncate text-base font-semibold" :title="groupFilter">
                {{ groupFilter }}
              </h1>
              <Badge :variant="groupStatusVariant" class="text-xs">
                {{ t(`groups.status.${activeGroupState.status}`) }}
              </Badge>
            </div>
            <p class="truncate text-xs text-muted-foreground">
              {{
                t('groups.runtimeProgress', {
                  installed: activeGroupState.installedSkills,
                  total: activeGroupState.totalSkills,
                  enabled: activeGroupState.enabledInstallations,
                  disabled: activeGroupState.disabledInstallations,
                })
              }}
            </p>
          </div>
        </div>
        <div class="app-no-drag ml-auto flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" class="cursor-pointer" @click="openMemberEditor">
            <ListPlus />
            {{ t('groups.manageSkills') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="activeGroupEmpty"
            @click="groupApplyOpen = !groupApplyOpen"
          >
            <CloudDownload />
            {{ t('groups.applyPackage') }}
          </Button>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                class="size-8 cursor-pointer"
                :aria-label="t('groups.actions')"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                :side-offset="6"
                class="z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
              >
                <DropdownMenuItem
                  :disabled="cannotManageGroup || activeGroupState.status === 'enabled'"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
                  @select="setActiveGroupEnabled(true)"
                >
                  <Power />
                  {{ t('groups.enableGroup') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  :disabled="cannotManageGroup || activeGroupState.status === 'disabled'"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
                  @select="setActiveGroupEnabled(false)"
                >
                  <PowerOff />
                  {{ t('groups.disableGroup') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator class="my-1 h-px bg-border" />
                <DropdownMenuItem
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent"
                  @select="exportActiveGroup"
                >
                  <Copy />
                  {{ t('groups.exportAction') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent"
                  @select="openRenameGroup"
                >
                  <Pencil />
                  {{ t('groups.renameAction') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator class="my-1 h-px bg-border" />
                <DropdownMenuItem
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                  @select="removeActiveGroup"
                >
                  <Trash2 />
                  {{ t('groups.deleteAction') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>
        <div class="app-no-drag flex w-full basis-full items-center gap-2 border-t pt-2">
          <div class="relative w-64 max-w-full">
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input v-model="search" :placeholder="t('groups.searchSkillsPh')" class="h-8 pl-8" />
          </div>
          <Select v-model="sortBy" :options="sortOptions" />
          <div class="flex shrink-0 items-center rounded-md border bg-background p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :class="[
                'size-7 cursor-pointer',
                viewMode === 'grid' && 'bg-accent text-accent-foreground',
              ]"
              :title="t('app.gridView')"
              :aria-label="t('app.gridView')"
              :aria-pressed="viewMode === 'grid'"
              @click="viewMode = 'grid'"
            >
              <LayoutGrid class="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :class="[
                'size-7 cursor-pointer',
                viewMode === 'tree' && 'bg-accent text-accent-foreground',
              ]"
              :title="t('app.treeView')"
              :aria-label="t('app.treeView')"
              :aria-pressed="viewMode === 'tree'"
              @click="viewMode = 'tree'"
            >
              <ListTree class="size-4" />
            </Button>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="app-no-drag flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div class="relative w-64 max-w-full grow sm:grow-0">
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input v-model="search" :placeholder="t('app.searchPlaceholder')" class="h-8 pl-8" />
          </div>
          <Select v-model="ownershipModel" :options="ownershipOptions" />
          <Select v-model="sortBy" :options="sortOptions" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            :aria-pressed="driftOnly"
            :class="[
              'cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5',
              driftOnly
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400'
                : 'text-foreground hover:border-foreground/40 hover:bg-background',
            ]"
            @click="driftOnly = !driftOnly"
          >
            <TriangleAlert class="size-3.5" />
            {{ t('app.driftOnly') }}
          </Button>
          <div class="flex shrink-0 items-center rounded-md border bg-background p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :class="[
                'size-7 cursor-pointer',
                viewMode === 'grid' && 'bg-accent text-accent-foreground',
              ]"
              :title="t('app.gridView')"
              :aria-label="t('app.gridView')"
              :aria-pressed="viewMode === 'grid'"
              @click="viewMode = 'grid'"
            >
              <LayoutGrid class="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :class="[
                'size-7 cursor-pointer',
                viewMode === 'tree' && 'bg-accent text-accent-foreground',
              ]"
              :title="t('app.treeView')"
              :aria-label="t('app.treeView')"
              :aria-pressed="viewMode === 'tree'"
              @click="viewMode = 'tree'"
            >
              <ListTree class="size-4" />
            </Button>
          </div>
          <label class="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
            <span>{{ t('batch.manage') }}</span>
            <Switch
              v-model="batchMode"
              :disabled="batchBusy"
              @update:model-value="handleBatchModeChange"
            />
          </label>
          <Button
            v-if="batchMode && filtered.length > 0"
            variant="ghost"
            size="sm"
            class="cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5"
            :disabled="batchBusy"
            @click="toggleSelectAll"
          >
            <Check class="size-3.5" />
            {{ t(allVisibleSelected ? 'batch.clear' : 'batch.selectAll') }}
          </Button>
          <Button
            v-if="batchMode && selectedNames.size > 0"
            variant="ghost"
            size="sm"
            class="cursor-pointer px-2.5 font-normal"
            :disabled="batchBusy"
            @click="clearSelection"
          >
            {{ t('batch.clearSelection') }}
          </Button>
        </div>
        <div class="app-no-drag ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            class="cursor-pointer"
            :title="t('newSkill.title')"
            :aria-label="t('newSkill.title')"
            @click="emit('newSkill')"
          >
            <Plus />
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="cursor-pointer"
            :title="t('import.title')"
            :aria-label="t('import.title')"
            @click="emit('importSkills')"
          >
            <Import />
          </Button>
          <Button
            variant="outline"
            class="cursor-pointer"
            :disabled="loading"
            @click="refresh"
          >
            <RefreshCw :class="loading ? 'animate-spin' : ''" />
            {{ t('app.rescan') }}
          </Button>
        </div>
      </template>
    </header>

    <ScrollArea class="flex-1" viewport-class="px-6 py-5">
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
            :disabled="batchBusy || projectRoots.length === 0 || projectCapablePlatforms.length === 0"
            @click="openBatchProject"
          >
            <FolderPlus class="size-3.5" />
            {{ t('batch.addProject') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="cursor-pointer"
            :disabled="batchBusy || groups.length === 0"
            @click="openBatchGroups"
          >
            <Layers class="size-3.5" />
            {{ t('batch.addGroups') }}
          </Button>
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
        </div>
      </div>

      <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.scanning') }}
      </div>
      <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>
      <GroupEmptyState
        v-else-if="groupFilter && activeGroupState && activeGroupEmpty"
        :name="activeGroupState.name"
        @browse-skills="openMemberEditor"
        @new-skill="emit('newSkill')"
      />
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
      <SkillAgentTree
        v-else-if="viewMode === 'tree'"
        :skills="filtered"
        :batch-mode="batchMode"
        :group-context="Boolean(groupFilter)"
        :selected-names="selectedNames"
        :busy-names="busySkillNames"
        :current-platform="platformFilter ?? undefined"
        :project-filter="projectFilter ?? undefined"
        :ownership-filter="ownershipFilter ?? undefined"
        @open="emit('openSkill', $event)"
        @edit="emit('editSkill', $event)"
        @toggle-selected="toggleSelected"
        @toggle-enabled="requestToggle"
        @remove-from-group="removeSkillFromActiveGroup"
        @uninstall="requestUninstall"
      />
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SkillCard
          v-for="skill in filtered"
          :key="skill.name"
          :skill="skill"
          :busy="removing.has(skill.name) || toggling.has(skill.name)"
          :batch-mode="batchMode"
          :group-context="Boolean(groupFilter)"
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
          @remove-from-group="removeSkillFromActiveGroup(skill.name)"
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

    <DialogRoot v-model:open="batchProjectOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">{{ t('batch.addProjectTitle') }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            {{ t('batch.addProjectHint', { n: selectedSkills.length }) }}
          </DialogDescription>
          <div class="mt-4 flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium">{{ t('batch.project') }}</span>
              <Select v-model="batchProjectRoot" :options="projectOptions" />
            </div>
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium">{{ t('batch.agents') }}</span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="platform in projectCapablePlatforms"
                  :key="platform.id"
                  type="button"
                  :class="[
                    'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                    batchProjectAgents.includes(platform.id)
                      ? 'border-foreground bg-foreground text-background'
                      : 'hover:border-foreground/40',
                  ]"
                  @click="toggleBatchProjectAgent(platform.id)"
                >
                  <PlatformIcon :id="platform.id" :size="14" />
                  {{ platform.displayName }}
                </button>
              </div>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              :disabled="batchBusy"
              @click="batchProjectOpen = false"
            >
              {{ t('common.cancel') }}
            </Button>
            <Button
              size="sm"
              :disabled="batchBusy || !batchProjectRoot || batchProjectAgents.length === 0"
              @click="addSelectedToProject"
            >
              {{ t('batch.addProjectAction') }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="batchGroupOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">{{ t('batch.addGroupsTitle') }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            {{ t('batch.addGroupsHint', { n: selectedSkills.length }) }}
          </DialogDescription>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="group in groups"
              :key="group.name"
              type="button"
              :class="[
                'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
                batchGroupNames.has(group.name)
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:border-foreground/40',
              ]"
              @click="toggleBatchGroup(group.name)"
            >
              {{ group.name }}
            </button>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="batchGroupOpen = false">
              {{ t('common.cancel') }}
            </Button>
            <Button
              size="sm"
              :disabled="batchGroupNames.size === 0"
              @click="addSelectedToGroups"
            >
              {{ t('batch.addGroupsAction', { n: batchGroupNames.size }) }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="renameOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
          @open-auto-focus.prevent
        >
          <DialogTitle class="text-base font-semibold">{{ t('groups.renameTitle') }}</DialogTitle>
          <Input
            v-model="renameValue"
            class="mt-4"
            autofocus
            @keydown.enter.prevent="submitRenameGroup"
          />
          <p v-if="renameDuplicate" class="mt-2 text-sm text-destructive">
            {{ t('groups.renameDuplicate') }}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="renameOpen = false">
              {{ t('common.cancel') }}
            </Button>
            <Button
              size="sm"
              :disabled="!renameValue.trim() || renameDuplicate"
              @click="submitRenameGroup"
            >
              {{ t('groups.renameAction') }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="memberEditorOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 flex max-h-[min(680px,80vh)] w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-background p-5 shadow-xl outline-none"
          @open-auto-focus.prevent
        >
          <DialogTitle class="text-base font-semibold">
            {{ t('groups.manageSkillsTitle', { name: groupFilter }) }}
          </DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            {{ t('groups.manageSkillsHint') }}
          </DialogDescription>
          <div class="relative mt-4">
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="memberSearch"
              :placeholder="t('groups.manageSkillsSearchPh')"
              class="pl-8"
            />
          </div>
          <div class="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border p-1">
            <label
              v-for="name in memberEditorMissingNames"
              :key="name"
              class="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
            >
              <input
                type="checkbox"
                :checked="draftMemberNames.has(name)"
                class="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                @change="toggleDraftMember(name)"
              />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{ name }}</span>
                <span class="mt-0.5 block text-xs text-muted-foreground">
                  {{ t('groups.skillNotInstalled') }}
                </span>
              </span>
            </label>
            <label
              v-for="skill in memberEditorSkills"
              :key="skill.name"
              class="flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
            >
              <input
                type="checkbox"
                :checked="draftMemberNames.has(skill.name)"
                class="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                @change="toggleDraftMember(skill.name)"
              />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{ skill.name }}</span>
                <span class="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {{ skill.description }}
                </span>
              </span>
            </label>
            <p
              v-if="memberEditorSkills.length === 0 && memberEditorMissingNames.length === 0"
              class="px-3 py-10 text-center text-sm text-muted-foreground"
            >
              {{ t('groups.manageSkillsEmpty') }}
            </p>
          </div>
          <div class="mt-4 flex items-center justify-between gap-3">
            <p class="text-sm text-muted-foreground">
              {{ t('groups.selectedSkills', { n: draftMemberNames.size }) }}
            </p>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" class="cursor-pointer" @click="memberEditorOpen = false">
                {{ t('common.cancel') }}
              </Button>
              <Button size="sm" class="cursor-pointer" @click="saveGroupMembers">
                {{ t('groups.saveSkills') }}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
