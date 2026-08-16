<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import {
  ArrowLeft,
  Eye,
  FileText,
  FolderOpen,
  LockKeyhole,
  Pencil,
  Plus,
  TriangleAlert,
  Trash2,
} from '@lucide/vue'
import type { AggregatedSkill, Installation } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import CopyButton from '@/components/CopyButton.vue'
import DiffView from '@/components/DiffView.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import ResourcePreviewDialog from '@/components/ResourcePreviewDialog.vue'
import SkillEditor from '@/components/SkillEditor.vue'
import { agentLabel } from '@/lib/agents'
import { pathBasename } from '@/lib/paths'
import { hasScriptResources } from '@/lib/resources'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import type { SkillFocus } from '@/lib/navigation'

const props = defineProps<{
  skill: AggregatedSkill
  inset?: boolean
  focus?: SkillFocus
  initialMode?: 'view' | 'edit'
}>()
const emit = defineEmits<{ close: [] }>()

const { detectedPlatforms, install, installSkill, refresh, setEnabled } = useSkills()
const { projectRoots, groups } = useSettings()

const driftSection = useTemplateRef<HTMLElement>('driftSection')
const installSection = useTemplateRef<HTMLElement>('installSection')

function focusSection(): void {
  if (!props.focus) return
  const target = props.focus === 'drift' ? driftSection.value : installSection.value
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

onMounted(() => void nextTick(focusSection))
watch(() => props.focus, () => void nextTick(focusSection))

/* ---------- groups membership ---------- */

function inGroup(name: string): boolean {
  return groups.value.find((g) => g.name === name)?.skills.includes(props.skill.name) ?? false
}

const memberGroups = computed(() => groups.value.filter((group) => inGroup(group.name)))
const availableGroups = computed(() => groups.value.filter((group) => !inGroup(group.name)))

const newGroupOpen = ref(false)
const newGroupName = ref('')

function openNewGroup(): void {
  newGroupName.value = ''
  newGroupOpen.value = true
}

function closeNewGroup(): void {
  newGroupOpen.value = false
  newGroupName.value = ''
}

function createGroupWithSkill(): void {
  const name = newGroupName.value.trim()
  if (!name || groups.value.some((g) => g.name === name)) return
  groups.value = [...groups.value, { name, skills: [props.skill.name] }]
  closeNewGroup()
}

watch(() => props.skill.name, closeNewGroup)

function toggleGroup(name: string): void {
  groups.value = groups.value.map((g) => {
    if (g.name !== name) return g
    return g.skills.includes(props.skill.name)
      ? { ...g, skills: g.skills.filter((n) => n !== props.skill.name) }
      : { ...g, skills: [...g.skills, props.skill.name] }
  })
}
const { t } = useI18n()

const mode = ref<'view' | 'edit'>(props.initialMode ?? 'view')

const writableInstallations = computed(() =>
  props.skill.installations.filter((installation) => !installation.readOnly),
)
const primaryInstallation = computed(
  () => writableInstallations.value[0] ?? props.skill.installations[0]!,
)
const canEdit = computed(() => writableInstallations.value.length > 0)
const skillContent = computed(() => primaryInstallation.value.skill.content)

function installationEnabled(installation: Installation): boolean {
  return installation.enabled !== false
}

function originLabel(installation: Installation): string {
  switch (installation.origin) {
    case 'legacy':
      return t('detail.originLegacy')
    case 'admin':
      return t('detail.originAdmin')
    case 'system':
      return t('detail.originSystem')
    case 'plugin':
      return t('detail.originPlugin')
    case 'project':
      return t('detail.scopeProject')
    default:
      return t('detail.scopeUser')
  }
}

function installationLocationLabel(installation: Installation): string {
  const scopeLabel =
    installation.scope === 'project'
      ? t('detail.projectScope', {
          root:
            installation.projectRoot?.split(/[\\/]/).filter(Boolean).pop() ??
            installation.projectRoot ??
            '',
        })
      : t('detail.userScope')
  return `${agentLabel(installation.agent)} · ${scopeLabel}`
}

/* ---------- resources ---------- */

const resources = computed(() => primaryInstallation.value.skill.resources ?? {})
const resourceList = computed(() =>
  Object.entries(resources.value).sort(([left], [right]) => left.localeCompare(right)),
)
const containsScripts = computed(() => hasScriptResources(resources.value))
const resourcePreviewTarget = shallowRef<{ path: string; source: string } | null>(null)

function previewResource(path: string, source: string): void {
  resourcePreviewTarget.value = { path, source }
}

watch(
  () => props.skill.name,
  () => {
    resourcePreviewTarget.value = null
  },
)

/* ---------- install to ---------- */

/** 'user' or a project root path */
const installScope = ref<string>('user')

const scopeOptions = computed(() => [
  { value: 'user', label: t('detail.userScope') },
  ...projectRoots.value.map((root) => ({
    value: root,
    label: t('detail.projectScope', { root: pathBasename(root) }),
  })),
])

const installedKeys = computed(
  () =>
    new Set(
      props.skill.installations.map((i) => `${i.agent}:${i.scope}:${i.projectRoot ?? ''}`),
    ),
)

const installableTargets = computed(() =>
  detectedPlatforms.value.filter((p) => {
    if (installScope.value !== 'user' && !p.hasProjectScope) return false
    const key =
      installScope.value === 'user' ? `${p.id}:user:` : `${p.id}:project:${installScope.value}`
    return !installedKeys.value.has(key)
  }),
)

const selectedTargets = ref<Set<string>>(new Set())
const busy = ref(false)
const actionError = ref<string | null>(null)
const confirmUninstall = ref(false)

function reveal(path: string): void {
  void window.skillsManager.revealInFolder(path)
}

function toggleTarget(id: string): void {
  const next = new Set(selectedTargets.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedTargets.value = next
}

async function runInstall(): Promise<void> {
  if (selectedTargets.value.size === 0) return
  busy.value = true
  actionError.value = null
  try {
    const targets: InstallTarget[] = [...selectedTargets.value].map((agent) =>
      installScope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: installScope.value },
    )
    const results = await install(props.skill, targets)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      actionError.value = failed
        .map((f) => `${agentLabel(f.target.agent)}: ${f.error}`)
        .join('；')
    }
    selectedTargets.value = new Set()
  } finally {
    busy.value = false
  }
}

/* ---------- drift ---------- */

const basePath = ref<string | null>(null)
const baseInstallation = computed(
  () =>
    props.skill.installations.find((i) => i.path === basePath.value) ??
    props.skill.installations[0] ??
    null,
)
const driftOthers = computed(() =>
  props.skill.installations.filter(
    (i) =>
      i.path !== baseInstallation.value?.path &&
      i.contentHash !== baseInstallation.value?.contentHash,
  ),
)
const writableDriftOthers = computed(() =>
  driftOthers.value.filter((installation) => !installation.readOnly),
)

async function syncFromBase(): Promise<void> {
  if (!baseInstallation.value || writableDriftOthers.value.length === 0) return
  busy.value = true
  actionError.value = null
  try {
    const targets: InstallTarget[] = writableDriftOthers.value.map((i) => ({
      agent: i.agent,
      scope: i.scope,
      projectRoot: i.projectRoot,
    }))
    const results = await installSkill(baseInstallation.value.skill, targets)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      actionError.value = failed
        .map((f) => `${agentLabel(f.target.agent)}: ${f.error}`)
        .join('；')
    }
  } finally {
    busy.value = false
  }
}

/* ---------- uninstall (to trash) ---------- */

async function trashWithUndo(paths: string[]): Promise<boolean> {
  const { token, results } = await window.skillsManager.trashUndoable(paths)
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    actionError.value = failed.map((f) => f.error).join('；')
    return false
  }
  showToast({
    message: t('common.trashedN', { n: paths.length }),
    actionLabel: t('common.undo'),
    onAction: async () => {
      if (await window.skillsManager.undoTrash(token)) {
        await refresh()
        showToast({ message: t('common.restored') })
      }
    },
  })
  return true
}

async function removeInstallation(path: string): Promise<void> {
  const installation = props.skill.installations.find((item) => item.path === path)
  if (!installation || installation.readOnly) return
  busy.value = true
  actionError.value = null
  try {
    const wasLast = props.skill.installations.length <= 1
    if (!(await trashWithUndo([path]))) return
    await refresh()
    if (wasLast) emit('close')
  } finally {
    busy.value = false
  }
}

async function toggleInstallation(installation: Installation): Promise<void> {
  if (installation.readOnly || busy.value) return
  busy.value = true
  actionError.value = null
  try {
    const results = await setEnabled(
      props.skill.name,
      [
        {
          agent: installation.agent,
          scope: installation.scope,
          projectRoot: installation.projectRoot,
        },
      ],
      !installationEnabled(installation),
    )
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      actionError.value = failed.map((result) => result.error).join('；')
    }
  } finally {
    busy.value = false
  }
}

async function runUninstall(): Promise<void> {
  if (writableInstallations.value.length === 0) return
  const removesAllInstallations =
    writableInstallations.value.length === props.skill.installations.length
  busy.value = true
  actionError.value = null
  try {
    if (!(await trashWithUndo(writableInstallations.value.map((i) => i.path)))) return
    await refresh()
    if (removesAllInstallations) emit('close')
  } finally {
    busy.value = false
    confirmUninstall.value = false
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
      <div class="flex h-9 min-w-0 items-center gap-2">
        <h1 class="select-text truncate text-base font-semibold leading-5 tracking-tight">
          {{ skill.name }}
        </h1>
        <CopyButton :text="skill.name" class="app-no-drag" />
        <Badge v-if="skill.version" variant="outline">v{{ skill.version }}</Badge>
        <Badge v-for="tag in skill.tags" :key="tag" variant="outline">{{ tag }}</Badge>
      </div>
      <div class="flex-1" />
      <Button
        v-if="mode === 'view' && canEdit"
        variant="outline"
        size="sm"
        class="app-no-drag"
        @click="mode = 'edit'"
      >
        <Pencil />
        {{ t('common.edit') }}
      </Button>
    </header>

    <!-- edit mode -->
    <ScrollArea v-if="mode === 'edit'" class="flex-1">
      <div class="mx-auto max-w-3xl">
        <SkillEditor :skill="skill" @done="mode = 'view'" @cancel="mode = 'view'" />
      </div>
    </ScrollArea>

    <!-- view mode -->
    <ScrollArea v-else class="flex-1">
      <div class="mx-auto max-w-3xl px-6 py-6">
        <p class="mb-4 text-sm text-muted-foreground">
          {{ skill.description || t('card.noDescription') }}
        </p>

        <section v-if="!props.focus" class="mb-6 rounded-lg border p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-sm font-medium">{{ t('groups.membership') }}</h3>
            <button
              type="button"
              class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              @click.stop="openNewGroup"
            >
              <Plus class="size-3.5" />
              {{ t('groups.createTitle') }}
            </button>
          </div>
          <div v-if="memberGroups.length > 0" class="flex flex-wrap gap-2">
            <button
              v-for="group in memberGroups"
              :key="group.name"
              type="button"
              class="cursor-pointer rounded-full border border-foreground bg-foreground px-2.5 py-0.5 text-sm text-background transition-colors hover:bg-foreground/85"
              @click="toggleGroup(group.name)"
            >
              {{ group.name }}
            </button>
          </div>
          <p v-else class="text-sm text-muted-foreground">{{ t('groups.noneAssigned') }}</p>
          <div v-if="availableGroups.length > 0" class="mt-3 border-t pt-3">
            <p class="mb-2 text-sm text-muted-foreground">{{ t('groups.available') }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="group in availableGroups"
                :key="group.name"
                type="button"
                class="cursor-pointer rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                @click="toggleGroup(group.name)"
              >
                {{ group.name }}
              </button>
            </div>
          </div>
        </section>

        <DialogRoot
          v-if="!props.focus && newGroupOpen"
          :open="newGroupOpen"
          @update:open="(open: boolean) => !open && closeNewGroup()"
        >
          <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
            <DialogContent
              class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 outline-none"
              @open-auto-focus.prevent
            >
              <DialogTitle class="mb-4 text-base font-semibold tracking-tight">
                {{ t('groups.createTitle') }}
              </DialogTitle>
              <Input
                v-model="newGroupName"
                :placeholder="t('groups.createPh')"
                class="text-sm"
                autofocus
                @keydown.enter="createGroupWithSkill"
              />
              <div class="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="closeNewGroup">
                  {{ t('common.cancel') }}
                </Button>
                <Button
                  size="sm"
                  :disabled="
                    !newGroupName.trim() || groups.some((g) => g.name === newGroupName.trim())
                  "
                  @click="createGroupWithSkill"
                >
                  {{ t('common.add') }}
                </Button>
              </div>
            </DialogContent>
          </DialogPortal>
        </DialogRoot>

        <!-- installations -->
        <section class="mb-8">
          <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('detail.installedLocations') }}
          </h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="inst in skill.installations"
              :key="inst.path"
              class="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div class="flex min-w-0 items-center gap-2">
                <PlatformIcon :id="inst.agent" :size="15" />
                <span class="shrink-0 text-sm">{{ agentLabel(inst.agent) }}</span>
                <Badge
                  variant="secondary"
                  class="shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 font-normal"
                >
                  {{ originLabel(inst) }}
                </Badge>
                <Badge
                  variant="outline"
                  :class="[
                    'shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 font-normal',
                    !installationEnabled(inst) && 'border-amber-500/40 text-amber-600 dark:text-amber-400',
                  ]"
                >
                  {{
                    installationEnabled(inst)
                      ? t('detail.enabled')
                      : t('detail.disabled')
                  }}
                </Badge>
                <code class="select-text truncate text-sm text-muted-foreground/70">{{
                  inst.path
                }}</code>
              </div>
              <span class="flex shrink-0 items-center gap-0.5">
                <CopyButton :text="inst.path" class="size-7" />
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  :title="t('detail.revealInFinder')"
                  @click="reveal(inst.path)"
                >
                  <FolderOpen class="size-3.5" />
                </Button>
                <Button
                  v-if="!inst.readOnly"
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-destructive"
                  :disabled="busy"
                  :title="t('detail.removeOne')"
                  @click="removeInstallation(inst.path)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
                <LockKeyhole
                  v-else
                  class="mx-1.5 size-3.5 text-muted-foreground"
                  :title="t('detail.readOnly')"
                />
                <button
                  v-if="!inst.readOnly"
                  type="button"
                  role="switch"
                  :aria-checked="installationEnabled(inst)"
                  :aria-label="
                    t(installationEnabled(inst) ? 'detail.disable' : 'detail.enable')
                  "
                  :title="t(installationEnabled(inst) ? 'detail.disable' : 'detail.enable')"
                  :disabled="busy"
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  :class="
                    installationEnabled(inst)
                      ? 'bg-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                      : 'bg-muted-foreground/25'
                  "
                  @click="toggleInstallation(inst)"
                >
                  <span
                    class="size-3.5 rounded-full bg-white shadow-sm transition-transform"
                    :class="installationEnabled(inst) ? 'translate-x-[18px]' : 'translate-x-[3px]'"
                  />
                </button>
              </span>
            </li>
          </ul>
        </section>

        <!-- drift -->
        <section
          v-if="skill.hasDrift"
          ref="driftSection"
          tabindex="-1"
          :class="[
            'mb-8 scroll-mt-6 outline-none transition-colors',
            props.focus === 'drift' && 'border-l-2 border-amber-500 pl-4',
          ]"
        >
          <h3
            class="mb-2 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3.5" />
            {{ t('detail.drift') }}
          </h3>
          <p class="mb-3 text-sm text-muted-foreground">{{ t('detail.driftHint') }}</p>
          <div class="mb-3 flex flex-wrap gap-2">
            <button
              v-for="inst in skill.installations"
              :key="inst.path"
              type="button"
              :class="[
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                baseInstallation?.path === inst.path
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:border-foreground/40',
              ]"
              @click="basePath = inst.path"
            >
              <PlatformIcon :id="inst.agent" :size="14" />
              {{ agentLabel(inst.agent) }}
              <Badge
                variant="outline"
                :class="
                  baseInstallation?.path === inst.path ? 'border-background/40 text-background' : ''
                "
              >
                {{ originLabel(inst) }}
              </Badge>
            </button>
          </div>
          <div v-for="other in driftOthers" :key="other.path" class="mb-3">
            <p class="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>{{ t('detail.diffWith', { agent: installationLocationLabel(other) }) }}</span>
              <Badge v-if="other.readOnly" variant="secondary">
                {{ t('card.readOnly') }}
              </Badge>
            </p>
            <DiffView :base="other.skill.content" :other="baseInstallation?.skill.content ?? ''" />
          </div>
          <div v-if="writableDriftOthers.length > 0" class="mb-3">
            <p class="mb-2 text-sm font-medium">{{ t('detail.syncTargets') }}</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="target in writableDriftOthers"
                :key="target.path"
                class="flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-sm"
                :title="target.path"
              >
                <PlatformIcon :id="target.agent" :size="14" />
                <span class="truncate">{{ installationLocationLabel(target) }}</span>
              </span>
            </div>
          </div>
          <Button
            size="sm"
            :disabled="busy || writableDriftOthers.length === 0"
            @click="syncFromBase"
          >
            {{
              busy
                ? t('detail.syncing')
                : t('detail.syncToOthers', { n: writableDriftOthers.length })
            }}
          </Button>
        </section>

        <!-- install to -->
        <section
          ref="installSection"
          tabindex="-1"
          :class="[
            'mb-8 scroll-mt-6 outline-none transition-colors',
            props.focus === 'install' && 'border-l-2 border-foreground/30 pl-4',
          ]"
        >
          <div class="mb-2 flex items-center justify-between gap-4">
            <h3 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {{ t('detail.installTo') }}
            </h3>
            <Select
              v-if="projectRoots.length > 0"
              v-model="installScope"
              class="max-w-[60%] shrink-0"
              :options="scopeOptions"
            />
          </div>
          <div v-if="installableTargets.length > 0" class="flex flex-wrap gap-2">
            <button
              v-for="p in installableTargets"
              :key="p.id"
              type="button"
              :class="[
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                selectedTargets.has(p.id)
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:border-foreground/40',
              ]"
              @click="toggleTarget(p.id)"
            >
              <PlatformIcon :id="p.id" :size="14" />
              {{ p.displayName }}
            </button>
          </div>
          <p v-else class="text-sm text-muted-foreground">{{ t('detail.allInstalled') }}</p>
          <Button
            v-if="installableTargets.length > 0"
            class="mt-3"
            size="sm"
            :disabled="selectedTargets.size === 0 || busy"
            @click="runInstall"
          >
            {{ busy ? t('detail.installing') : t('detail.installN', { n: selectedTargets.size }) }}
          </Button>
          <p v-if="actionError" class="mt-2 text-sm text-destructive">{{ actionError }}</p>
        </section>

        <!-- resources -->
        <section v-if="resourceList.length > 0" class="mb-8">
          <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('detail.resources') }}
          </h3>
          <div
            v-if="containsScripts"
            class="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
          >
            <TriangleAlert class="size-3.5 shrink-0" />
            {{ t('detail.scriptWarning') }}
          </div>
          <ScrollArea class="max-h-96" viewport-class="max-h-96 pr-2">
            <ul class="flex flex-col gap-1.5">
              <li v-for="[rel, abs] in resourceList" :key="rel">
                <button
                  type="button"
                  class="group flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md border px-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/35"
                  :aria-label="t('detail.previewResource', { name: rel })"
                  :title="t('detail.previewResource', { name: rel })"
                  @click="previewResource(rel, abs)"
                >
                  <FileText class="size-4 shrink-0 text-muted-foreground" />
                  <code class="min-w-0 flex-1 select-text truncate text-sm">{{ rel }}</code>
                  <Eye
                    class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                </button>
              </li>
            </ul>
          </ScrollArea>
        </section>

        <ResourcePreviewDialog
          :resource="resourcePreviewTarget"
          @close="resourcePreviewTarget = null"
        />

        <!-- content -->
        <section class="mb-8">
          <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            SKILL.md
          </h3>
          <MarkdownView :content="skillContent" preview-id="skill-detail" class="select-text" />
        </section>

        <!-- danger zone -->
        <section
          v-if="writableInstallations.length > 0"
          class="flex items-center justify-between rounded-md border px-4 py-3"
        >
          <p class="text-sm text-muted-foreground">
            {{ t('detail.manageableCount', { n: writableInstallations.length }) }}
          </p>
          <div class="flex items-center gap-2">
            <template v-if="confirmUninstall">
              <span class="text-sm text-muted-foreground">
                {{ t('detail.deleteConfirm', { n: writableInstallations.length }) }}
              </span>
              <Button variant="destructive" size="sm" :disabled="busy" @click="runUninstall">
                {{ t('detail.confirmDelete') }}
              </Button>
              <Button variant="ghost" size="sm" @click="confirmUninstall = false">
                {{ t('common.cancel') }}
              </Button>
            </template>
            <Button
              v-else
              variant="ghost"
              size="sm"
              class="text-destructive hover:text-destructive"
              @click="confirmUninstall = true"
            >
              <Trash2 />
              {{ t('common.delete') }}
            </Button>
          </div>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
