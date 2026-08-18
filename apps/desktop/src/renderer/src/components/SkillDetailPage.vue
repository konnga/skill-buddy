<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import {
  ArrowLeft,
  Pencil,
  TriangleAlert,
  Trash2,
} from '@lucide/vue'
import type { AggregatedSkill, Installation } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import CopyButton from '@/components/CopyButton.vue'
import DiffView from '@/components/DiffView.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import SkillGroupMembershipSection from '@/components/skill-detail/SkillGroupMembershipSection.vue'
import SkillInstallationsSection from '@/components/skill-detail/SkillInstallationsSection.vue'
import SkillResourcesSection from '@/components/skill-detail/SkillResourcesSection.vue'
import SkillEditor from '@/components/SkillEditor.vue'
import { agentLabel } from '@/lib/agents'
import { hasScriptResources } from '@/lib/resources'
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

const { install, installSkill, refresh, setEnabled } = useSkills()

const driftSection = useTemplateRef<HTMLElement>('driftSection')
const installSection = useTemplateRef<HTMLElement>('installSection')

/** 从注意事项入口进入详情时，将对应操作区域滚动到可见位置并建立键盘焦点。 */
function focusSection(): void {
  if (!props.focus) return
  const target = props.focus === 'drift' ? driftSection.value : installSection.value
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

onMounted(() => void nextTick(focusSection))
watch(() => props.focus, () => void nextTick(focusSection))

const { t } = useI18n()

const mode = shallowRef<'view' | 'edit'>(props.initialMode ?? 'view')

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

function pathBaseName(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized.split('/').pop() ?? normalized
}

function installationProjectName(installation: Installation): string {
  return installation.projectRoot ? pathBaseName(installation.projectRoot) : ''
}

function originLabel(installation: Installation): string {
  let label: string
  switch (installation.origin) {
    case 'legacy':
      label = t('detail.originLegacy')
      break
    case 'admin':
      label = t('detail.originAdmin')
      break
    case 'system':
      label = t('detail.originSystem')
      break
    case 'plugin':
      label = t('detail.originPlugin')
      break
    case 'project':
      label = t('detail.scopeProject')
      break
    default:
      label = t('detail.scopeUser')
  }
  const projectName = installationProjectName(installation)
  return installation.scope === 'project' && projectName
    ? `${label} · ${projectName}`
    : label
}

function installationLocationLabel(installation: Installation): string {
  const scopeLabel =
    installation.scope === 'project'
      ? t('detail.projectScope', {
          root: installationProjectName(installation),
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

/* ---------- install to ---------- */

const installedTargets = computed<InstallTarget[]>(() =>
  props.skill.installations.map((installation) => ({
    agent: installation.agent,
    scope: installation.scope,
    projectRoot: installation.projectRoot,
  })),
)
const targets = ref<InstallTarget[]>([])
const busy = shallowRef(false)
const actionError = shallowRef<string | null>(null)
const confirmUninstall = shallowRef(false)

function reveal(path: string): void {
  void window.skillsManager.revealInFolder(path)
}

async function runInstall(): Promise<void> {
  if (targets.value.length === 0) return
  busy.value = true
  actionError.value = null
  try {
    const results = await install(props.skill, targets.value)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      actionError.value = failed
        .map((f) => `${agentLabel(f.target.agent)}: ${f.error}`)
        .join('；')
    }
    targets.value = []
  } finally {
    busy.value = false
  }
}

/* ---------- drift ---------- */

const basePath = shallowRef<string | null>(null)
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

/** 统一执行可撤销删除，只有整批路径全部成功时才允许调用方继续刷新或关闭页面。 */
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
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag cursor-pointer"
        @click="emit('close')"
      >
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
        class="app-no-drag cursor-pointer"
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

        <SkillGroupMembershipSection v-if="!props.focus" :skill-name="skill.name" />

        <SkillInstallationsSection
          :installations="skill.installations"
          :busy="busy"
          @reveal="reveal"
          @remove="removeInstallation"
          @toggle="toggleInstallation"
        />
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
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
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
            class="cursor-pointer"
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
          <PlatformTargetPicker
            v-model="targets"
            :label="t('detail.installTo')"
            :excluded="installedTargets"
          />
          <Button
            class="mt-3 cursor-pointer"
            size="sm"
            :disabled="targets.length === 0 || busy"
            @click="runInstall"
          >
            {{ busy ? t('detail.installing') : t('detail.installN', { n: targets.length }) }}
          </Button>
          <p v-if="actionError" class="mt-2 text-sm text-destructive">{{ actionError }}</p>
        </section>

        <SkillResourcesSection
          :skill-name="skill.name"
          :resources="resourceList"
          :contains-scripts="containsScripts"
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
              <Button
                variant="destructive"
                size="sm"
                class="cursor-pointer"
                :disabled="busy"
                @click="runUninstall"
              >
                {{ t('detail.confirmDelete') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="cursor-pointer"
                @click="confirmUninstall = false"
              >
                {{ t('common.cancel') }}
              </Button>
            </template>
            <Button
              v-else
              variant="ghost"
              size="sm"
              class="cursor-pointer text-destructive hover:text-destructive"
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
