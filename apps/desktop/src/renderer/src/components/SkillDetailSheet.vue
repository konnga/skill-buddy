<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import MarkdownIt from 'markdown-it'
import { FolderOpen, Pencil, TriangleAlert, Trash2, X } from '@lucide/vue'
import type { AggregatedSkill } from '@skills-manager/core'
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
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ skill: AggregatedSkill | null }>()
const emit = defineEmits<{ close: [] }>()

const { detectedPlatforms, install, installSkill, uninstall } = useSkills()
const { projectRoots, registryUrl, registryToken } = useSettings()
const { t } = useI18n()

/* ---------- publish to registry ---------- */

const registryConfigured = computed(() => Boolean(registryUrl.value && registryToken.value))
const registryCfg = computed(() => ({ url: registryUrl.value, token: registryToken.value }))
const orgs = ref<{ name: string }[]>([])
const publishOrg = ref('')
const publishVersion = ref('')
const publishBusy = ref(false)
const publishMessage = ref<string | null>(null)
const publishError = ref<string | null>(null)

async function loadOrgs(): Promise<void> {
  if (!registryConfigured.value) return
  try {
    orgs.value = await window.skillsManager.registryOrgs(registryCfg.value)
    if (!publishOrg.value && orgs.value[0]) publishOrg.value = orgs.value[0].name
  } catch {
    orgs.value = []
  }
}

async function publish(): Promise<void> {
  if (!props.skill || !publishOrg.value || !/^\d+\.\d+\.\d+$/.test(publishVersion.value)) return
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
  } catch (e) {
    publishError.value = e instanceof Error ? e.message : String(e)
  } finally {
    publishBusy.value = false
  }
}

const mode = ref<'view' | 'edit'>('view')

const md = new MarkdownIt({ linkify: true })
const rendered = computed(() =>
  props.skill ? md.render(props.skill.installations[0]!.skill.content) : '',
)

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
      props.skill?.installations.map((i) => `${i.agent}:${i.scope}:${i.projectRoot ?? ''}`) ??
        [],
    ),
)

const installableTargets = computed(() =>
  detectedPlatforms.value.filter((p) => {
    if (installScope.value !== 'user' && !p.hasProjectScope) return false
    const key =
      installScope.value === 'user'
        ? `${p.id}:user:`
        : `${p.id}:project:${installScope.value}`
    return !installedKeys.value.has(key)
  }),
)

const selectedTargets = ref<Set<string>>(new Set())
const busy = ref(false)
const actionError = ref<string | null>(null)
const confirmUninstall = ref(false)

/* ---------- drift ---------- */

const basePath = ref<string | null>(null)
const baseInstallation = computed(
  () =>
    props.skill?.installations.find((i) => i.path === basePath.value) ??
    props.skill?.installations[0] ??
    null,
)
const driftOthers = computed(
  () =>
    props.skill?.installations.filter(
      (i) =>
        i.path !== baseInstallation.value?.path &&
        i.contentHash !== baseInstallation.value?.contentHash,
    ) ?? [],
)

watch(
  () => props.skill?.name,
  () => {
    mode.value = 'view'
    selectedTargets.value = new Set()
    actionError.value = null
    confirmUninstall.value = false
    installScope.value = 'user'
    basePath.value = null
    publishMessage.value = null
    publishError.value = null
    publishVersion.value = props.skill?.version ?? '1.0.0'
    void loadOrgs()
  },
)

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
  if (!props.skill || selectedTargets.value.size === 0) return
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

async function syncFromBase(): Promise<void> {
  if (!props.skill || !baseInstallation.value) return
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

async function runUninstall(): Promise<void> {
  if (!props.skill) return
  busy.value = true
  actionError.value = null
  try {
    const targets: InstallTarget[] = props.skill.installations.map((i) => ({
      agent: i.agent,
      scope: i.scope,
      projectRoot: i.projectRoot,
    }))
    await uninstall(props.skill.name, targets)
    emit('close')
  } finally {
    busy.value = false
    confirmUninstall.value = false
  }
}
</script>

<template>
  <DialogRoot :open="skill !== null" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-[92vw] flex-col border-l bg-background shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <template v-if="skill">
          <!-- header -->
          <header class="flex items-start justify-between gap-3 border-b px-6 py-4">
            <div class="min-w-0">
              <span class="flex min-w-0 items-center gap-2">
                <DialogTitle class="select-text truncate text-base font-semibold tracking-tight">
                  {{ skill.name }}
                </DialogTitle>
                <CopyButton :text="skill.name" />
              </span>
              <p v-if="mode === 'view'" class="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {{ skill.description || t('card.noDescription') }}
              </p>
              <div v-if="mode === 'view'" class="mt-2 flex flex-wrap gap-1.5">
                <Badge v-if="skill.version" variant="outline">v{{ skill.version }}</Badge>
                <Badge v-for="tag in skill.tags" :key="tag" variant="outline">{{ tag }}</Badge>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button
                v-if="mode === 'view'"
                variant="outline"
                size="sm"
                @click="mode = 'edit'"
              >
                <Pencil />
                {{ t('common.edit') }}
              </Button>
              <Button variant="ghost" size="icon" @click="emit('close')">
                <X />
              </Button>
            </div>
          </header>

          <!-- edit mode -->
          <div v-if="mode === 'edit'" class="flex-1 overflow-y-auto">
            <SkillEditor :skill="skill" @done="mode = 'view'" @cancel="mode = 'view'" />
          </div>

          <!-- view mode -->
          <div v-else class="flex-1 overflow-y-auto">
            <!-- installations -->
            <section class="border-b px-6 py-4">
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
                    <Badge variant="outline">{{ inst.scope }}</Badge>
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
                  </span>
                </li>
              </ul>
            </section>

            <!-- drift -->
            <section v-if="skill.hasDrift" class="border-b px-6 py-4">
              <h3
                class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
              >
                <TriangleAlert class="size-3.5" />
                {{ t('detail.drift') }}
              </h3>
              <p class="mb-3 text-xs text-muted-foreground">
                {{ t('detail.driftHint') }}
              </p>
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
                    :class="baseInstallation?.path === inst.path ? 'border-background/40 text-background' : ''"
                  >
                    {{ inst.scope }}
                  </Badge>
                </button>
              </div>
              <div v-for="other in driftOthers" :key="other.path" class="mb-3">
                <p class="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {{ t('detail.diffWith', { agent: agentLabel(other.agent) }) }}
                </p>
                <DiffView
                  :base="other.skill.content"
                  :other="baseInstallation?.skill.content ?? ''"
                />
              </div>
              <Button
                size="sm"
                :disabled="busy || driftOthers.length === 0"
                @click="syncFromBase"
              >
                {{ busy ? t('detail.syncing') : t('detail.syncToOthers', { n: driftOthers.length }) }}
              </Button>
            </section>

            <!-- install to -->
            <section class="border-b px-6 py-4">
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
            <section v-if="registryConfigured" class="border-b px-6 py-4">
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
              </div>
              <p v-if="publishMessage" class="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                {{ publishMessage }}
              </p>
              <p v-if="publishError" class="mt-2 text-xs text-destructive">{{ publishError }}</p>
            </section>

            <!-- content -->
            <section class="px-6 py-4">
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                SKILL.md
              </h3>
              <article class="markdown-body text-sm leading-relaxed" v-html="rendered" />
            </section>
          </div>

          <!-- footer -->
          <footer
            v-if="mode === 'view'"
            class="flex items-center justify-between border-t px-6 py-3"
          >
            <p class="text-xs text-muted-foreground">{{ t('detail.installedCount', { n: skill.installations.length }) }}</p>
            <div class="flex items-center gap-2">
              <template v-if="confirmUninstall">
                <span class="text-xs text-muted-foreground">
                  {{ t('detail.deleteConfirm', { n: skill.installations.length }) }}
                </span>
                <Button variant="destructive" size="sm" :disabled="busy" @click="runUninstall">
                  {{ t('detail.confirmDelete') }}
                </Button>
                <Button variant="ghost" size="sm" @click="confirmUninstall = false">{{ t('common.cancel') }}</Button>
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
          </footer>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.markdown-body h1,
.markdown-body h2,
.markdown-body h3 {
  font-weight: 600;
  margin: 1.25em 0 0.5em;
}
.markdown-body h1 { font-size: 1.25rem; }
.markdown-body h2 { font-size: 1.1rem; }
.markdown-body h3 { font-size: 1rem; }
.markdown-body p { margin: 0.5em 0; }
.markdown-body ul, .markdown-body ol { margin: 0.5em 0; padding-left: 1.5em; }
.markdown-body ul { list-style: disc; }
.markdown-body ol { list-style: decimal; }
.markdown-body code {
  background: var(--muted);
  border-radius: 4px;
  padding: 0.15em 0.4em;
  font-size: 0.85em;
}
.markdown-body pre {
  background: var(--muted);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.75em 0;
}
.markdown-body pre code { background: transparent; padding: 0; }
.markdown-body blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1em;
  color: var(--muted-foreground);
  margin: 0.75em 0;
}
.markdown-body a { color: var(--primary); text-decoration: underline; }
</style>
