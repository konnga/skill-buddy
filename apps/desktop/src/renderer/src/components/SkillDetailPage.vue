<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import { ArrowLeft, FolderOpen, Pencil, Plus, TriangleAlert, Trash2 } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import CopyButton from '@/components/CopyButton.vue'
import DiffView from '@/components/DiffView.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import SkillEditor from '@/components/SkillEditor.vue'
import { agentLabel } from '@/lib/agents'
import { hasScriptResources, nextPatch } from '@/lib/resources'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ skill: AggregatedSkill; inset?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { detectedPlatforms, install, installSkill, refresh } = useSkills()
const { projectRoots, registryUrl, registryToken, groups } = useSettings()

/* ---------- groups membership ---------- */

function inGroup(name: string): boolean {
  return groups.value.find((g) => g.name === name)?.skills.includes(props.skill.name) ?? false
}

const newGroupOpen = ref(false)
const newGroupName = ref('')

function createGroupWithSkill(): void {
  const name = newGroupName.value.trim()
  if (!name || groups.value.some((g) => g.name === name)) return
  groups.value = [...groups.value, { name, skills: [props.skill.name] }]
  newGroupName.value = ''
  newGroupOpen.value = false
}

function toggleGroup(name: string): void {
  groups.value = groups.value.map((g) => {
    if (g.name !== name) return g
    return g.skills.includes(props.skill.name)
      ? { ...g, skills: g.skills.filter((n) => n !== props.skill.name) }
      : { ...g, skills: [...g.skills, props.skill.name] }
  })
}
const { t } = useI18n()

const mode = ref<'view' | 'edit'>('view')

const skillContent = computed(() => props.skill.installations[0]!.skill.content)

/* ---------- publish to registry ---------- */

const registryConfigured = computed(() => Boolean(registryUrl.value && registryToken.value))
const registryCfg = computed(() => ({ url: registryUrl.value, token: registryToken.value }))
const orgs = ref<{ name: string }[]>([])
const publishOrg = ref('')
const publishVersion = ref(props.skill.version ?? '1.0.0')
const publishBusy = ref(false)
const publishMessage = ref<string | null>(null)
const publishError = ref<string | null>(null)
const latestPublished = ref<string | null>(null)

async function loadOrgs(): Promise<void> {
  if (!registryConfigured.value) return
  try {
    orgs.value = await window.skillsManager.registryOrgs(registryCfg.value)
    if (!publishOrg.value && orgs.value[0]) publishOrg.value = orgs.value[0].name
    await suggestVersion()
  } catch {
    orgs.value = []
  }
}

/** Suggest next patch after the latest published version of this skill. */
async function suggestVersion(): Promise<void> {
  latestPublished.value = null
  if (!publishOrg.value) return
  try {
    const versions = await window.skillsManager.registryVersions(
      registryCfg.value,
      publishOrg.value,
      props.skill.name,
    )
    if (versions[0]) {
      latestPublished.value = versions[0].version
      publishVersion.value = nextPatch(versions[0].version)
    }
  } catch {
    /* not published yet — keep local default */
  }
}

watch(publishOrg, () => void suggestVersion())
onMounted(() => void loadOrgs())

async function publish(): Promise<void> {
  if (!publishOrg.value || !/^\d+\.\d+\.\d+$/.test(publishVersion.value)) return
  publishBusy.value = true
  publishError.value = null
  publishMessage.value = null
  try {
    await window.skillsManager.registryPublish(
      registryCfg.value,
      publishOrg.value,
      props.skill.installations[0]!.skill,
      publishVersion.value,
    )
    publishMessage.value = t('team.publishOk', {
      ref: `${publishOrg.value}/${props.skill.name}@${publishVersion.value}`,
    })
    await suggestVersion()
  } catch (e) {
    publishError.value = e instanceof Error ? e.message : String(e)
  } finally {
    publishBusy.value = false
  }
}

/* ---------- resources ---------- */

const resources = computed(() => props.skill.installations[0]?.skill.resources ?? {})
const resourceList = computed(() => Object.entries(resources.value))
const containsScripts = computed(() => hasScriptResources(resources.value))
const openResource = ref<string | null>(null)
const resourcePreview = ref('')
const resourceTruncated = ref(false)

async function toggleResource(rel: string, abs: string): Promise<void> {
  if (openResource.value === rel) {
    openResource.value = null
    return
  }
  try {
    const result = await window.skillsManager.readFile(abs)
    resourcePreview.value = result.content
    resourceTruncated.value = result.truncated
    openResource.value = rel
  } catch (e) {
    resourcePreview.value = e instanceof Error ? e.message : String(e)
    resourceTruncated.value = false
    openResource.value = rel
  }
}

/* ---------- install to ---------- */

/** 'user' or a project root path */
const installScope = ref<string>('user')

const scopeOptions = computed(() => [
  { value: 'user', label: t('detail.userScope') },
  ...projectRoots.value.map((root) => ({
    value: root,
    label: t('detail.projectScope', { root }),
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

async function syncFromBase(): Promise<void> {
  if (!baseInstallation.value) return
  busy.value = true
  actionError.value = null
  try {
    const targets: InstallTarget[] = driftOthers.value.map((i) => ({
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

async function removeInstallation(path: string): Promise<void> {
  busy.value = true
  actionError.value = null
  try {
    const wasLast = props.skill.installations.length <= 1
    const results = await window.skillsManager.trashPaths([path])
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      actionError.value = failed.map((f) => f.error).join('；')
      return
    }
    await refresh()
    if (wasLast) emit('close')
  } finally {
    busy.value = false
  }
}

async function runUninstall(): Promise<void> {
  busy.value = true
  actionError.value = null
  try {
    const results = await window.skillsManager.trashPaths(
      props.skill.installations.map((i) => i.path),
    )
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      actionError.value = failed.map((f) => f.error).join('；')
      return
    }
    await refresh()
    emit('close')
  } finally {
    busy.value = false
    confirmUninstall.value = false
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
      <div class="flex min-w-0 items-center gap-2">
        <h1 class="select-text truncate text-base font-semibold tracking-tight">
          {{ skill.name }}
        </h1>
        <CopyButton :text="skill.name" class="app-no-drag" />
        <Badge v-if="skill.version" variant="outline">v{{ skill.version }}</Badge>
        <Badge v-for="tag in skill.tags" :key="tag" variant="outline">{{ tag }}</Badge>
      </div>
      <div class="flex-1" />
      <Button
        v-if="mode === 'view'"
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
    <div v-if="mode === 'edit'" class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-3xl">
        <SkillEditor :skill="skill" @done="mode = 'view'" @cancel="mode = 'view'" />
      </div>
    </div>

    <!-- view mode -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-3xl px-6 py-6">
        <p class="mb-4 text-sm text-muted-foreground">
          {{ skill.description || t('card.noDescription') }}
        </p>

        <div class="mb-6 flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted-foreground">{{ t('groups.membership') }}</span>
          <button
            v-for="g in groups"
            :key="g.name"
            type="button"
            :class="[
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              inGroup(g.name)
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:border-foreground/40',
            ]"
            @click="toggleGroup(g.name)"
          >
            {{ g.name }}
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            @click="((newGroupName = ''), (newGroupOpen = true))"
          >
            <Plus class="size-3" />
            {{ t('groups.createTitle') }}
          </button>
        </div>

        <DialogRoot :open="newGroupOpen" @update:open="(o: boolean) => !o && (newGroupOpen = false)">
          <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
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
                <Button variant="ghost" size="sm" @click="newGroupOpen = false">
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
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                <Badge variant="outline">
                  {{ inst.scope === 'user' ? t('detail.scopeUser') : t('detail.scopeProject') }}
                </Badge>
                <code class="select-text truncate text-xs text-muted-foreground/70">{{
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
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-destructive"
                  :disabled="busy"
                  :title="t('detail.removeOne')"
                  @click="removeInstallation(inst.path)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </span>
            </li>
          </ul>
        </section>

        <!-- drift -->
        <section v-if="skill.hasDrift" class="mb-8">
          <h3
            class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3.5" />
            {{ t('detail.drift') }}
          </h3>
          <p class="mb-3 text-xs text-muted-foreground">{{ t('detail.driftHint') }}</p>
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
                {{ inst.scope === 'user' ? t('detail.scopeUser') : t('detail.scopeProject') }}
              </Badge>
            </button>
          </div>
          <div v-for="other in driftOthers" :key="other.path" class="mb-3">
            <p class="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {{ t('detail.diffWith', { agent: agentLabel(other.agent) }) }}
            </p>
            <DiffView :base="other.skill.content" :other="baseInstallation?.skill.content ?? ''" />
          </div>
          <Button size="sm" :disabled="busy || driftOthers.length === 0" @click="syncFromBase">
            {{ busy ? t('detail.syncing') : t('detail.syncToOthers', { n: driftOthers.length }) }}
          </Button>
        </section>

        <!-- install to -->
        <section class="mb-8">
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('detail.installTo') }}
          </h3>
          <div v-if="projectRoots.length > 0" class="mb-2">
            <Select v-model="installScope" class="max-w-full" :options="scopeOptions" />
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
          <p v-else class="text-xs text-muted-foreground">{{ t('detail.allInstalled') }}</p>
          <Button
            v-if="installableTargets.length > 0"
            class="mt-3"
            size="sm"
            :disabled="selectedTargets.size === 0 || busy"
            @click="runInstall"
          >
            {{ busy ? t('detail.installing') : t('detail.installN', { n: selectedTargets.size }) }}
          </Button>
          <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
        </section>

        <!-- publish -->
        <section v-if="registryConfigured" class="mb-8">
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('team.publish') }}
          </h3>
          <div class="flex flex-wrap items-center gap-2">
            <Select
              v-model="publishOrg"
              :options="orgs.map((o) => ({ value: o.name, label: o.name }))"
            />
            <Input
              v-model="publishVersion"
              :placeholder="t('team.publishVersion')"
              class="h-8 w-28 text-sm"
            />
            <Button
              size="sm"
              :disabled="publishBusy || !publishOrg || !/^\d+\.\d+\.\d+$/.test(publishVersion)"
              @click="publish"
            >
              {{ t('team.publish') }}
            </Button>
            <span v-if="latestPublished" class="text-xs text-muted-foreground">
              {{ t('team.suggestedVersion', { v: latestPublished }) }}
            </span>
          </div>
          <p v-if="publishMessage" class="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            {{ publishMessage }}
          </p>
          <p v-if="publishError" class="mt-2 text-xs text-destructive">{{ publishError }}</p>
        </section>

        <!-- resources -->
        <section v-if="resourceList.length > 0" class="mb-8">
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('detail.resources') }}
          </h3>
          <div
            v-if="containsScripts"
            class="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
          >
            <TriangleAlert class="size-3.5 shrink-0" />
            {{ t('detail.scriptWarning') }}
          </div>
          <ul class="flex flex-col gap-1.5">
            <li v-for="[rel, abs] in resourceList" :key="rel">
              <button
                class="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left transition-colors hover:border-foreground/30"
                @click="toggleResource(rel, abs)"
              >
                <code class="select-text truncate text-xs">{{ rel }}</code>
                <span class="text-xs text-muted-foreground">{{
                  openResource === rel ? '−' : '+'
                }}</span>
              </button>
              <pre
                v-if="openResource === rel"
                class="mt-1 max-h-56 overflow-auto rounded-md border bg-muted px-3 py-2 text-xs"
              ><code class="select-text">{{ resourcePreview }}</code><span v-if="resourceTruncated" class="text-muted-foreground">
{{ t('detail.truncated') }}</span></pre>
            </li>
          </ul>
        </section>

        <!-- content -->
        <section class="mb-8">
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            SKILL.md
          </h3>
          <MarkdownView :content="skillContent" preview-id="skill-detail" class="select-text" />
        </section>

        <!-- danger zone -->
        <section class="flex items-center justify-between rounded-md border px-4 py-3">
          <p class="text-xs text-muted-foreground">
            {{ t('detail.installedCount', { n: skill.installations.length }) }}
          </p>
          <div class="flex items-center gap-2">
            <template v-if="confirmUninstall">
              <span class="text-xs text-muted-foreground">
                {{ t('detail.deleteConfirm', { n: skill.installations.length }) }}
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
    </div>
  </div>
</template>

