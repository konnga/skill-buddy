<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { FolderOpen, GitBranch, X } from '@lucide/vue'
import type { FoundSkill } from '@skills-manager/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import MarkdownIt from 'markdown-it'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { hasScriptResources } from '@/lib/resources'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { installSkill, refresh } = useSkills()
const { t } = useI18n()

const tab = ref<'local' | 'git'>('local')
const gitUrl = ref('')
const fetching = ref(false)
const items = ref<FoundSkill[]>([])
const searched = ref(false)
/** temp clone root to clean up (git imports only) */
const cloneRoot = ref<string | null>(null)

const selected = ref<Set<string>>(new Set())
const previewDir = ref<string | null>(null)
const md = new MarkdownIt({ linkify: true })
const scope = ref('user')
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      tab.value = 'local'
      gitUrl.value = ''
      items.value = []
      searched.value = false
      selected.value = new Set()
      agents.value = []
      scope.value = 'user'
      error.value = null
    } else if (cloneRoot.value) {
      await window.skillsManager.cleanupImport(cloneRoot.value)
      cloneRoot.value = null
    }
  },
)

function setItems(found: FoundSkill[]): void {
  items.value = found
  searched.value = true
  selected.value = new Set(found.map((f) => f.dir))
}

async function pickLocalDir(): Promise<void> {
  error.value = null
  const dir = await window.skillsManager.pickDirectory()
  if (!dir) return
  fetching.value = true
  try {
    setItems(await window.skillsManager.findSkillsInDir(dir))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    fetching.value = false
  }
}

async function onDrop(event: DragEvent): Promise<void> {
  error.value = null
  const file = event.dataTransfer?.files[0] as (File & { path?: string }) | undefined
  if (!file?.path) return
  fetching.value = true
  try {
    setItems(await window.skillsManager.findSkillsInDir(file.path))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    fetching.value = false
  }
}

async function fetchGit(): Promise<void> {
  if (!gitUrl.value.trim()) return
  error.value = null
  fetching.value = true
  try {
    if (cloneRoot.value) await window.skillsManager.cleanupImport(cloneRoot.value)
    const result = await window.skillsManager.importFromGit(gitUrl.value.trim())
    cloneRoot.value = result.root
    setItems(result.items)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    fetching.value = false
  }
}

function toggleItem(dir: string): void {
  const next = new Set(selected.value)
  if (next.has(dir)) next.delete(dir)
  else next.add(dir)
  selected.value = next
}

async function runImport(): Promise<void> {
  error.value = null
  const chosen = items.value.filter((f) => selected.value.has(f.dir))
  if (chosen.length === 0 || agents.value.length === 0) {
    error.value = t('import.errTargets')
    return
  }
  busy.value = true
  try {
    const targets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const failures: string[] = []
    for (const f of chosen) {
      const results = await installSkill(f.skill, targets)
      failures.push(
        ...results
          .filter((r) => !r.ok)
          .map((r) => `${f.skill.name} → ${agentLabel(r.target.agent)}: ${r.error}`),
      )
    }
    if (failures.length > 0) {
      error.value = failures.join('；')
      return
    }
    await refresh()
    emit('close')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-[92vw] flex-col border-l bg-background outline-none"
        @open-auto-focus.prevent
      >
        <header class="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle class="text-base font-semibold tracking-tight">
            {{ t('import.title') }}
          </DialogTitle>
          <Button variant="ghost" size="icon" @click="emit('close')"><X /></Button>
        </header>

        <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <!-- source tabs -->
          <div class="flex gap-2">
            <button
              :class="[
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
                tab === 'local'
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:border-foreground/40',
              ]"
              @click="tab = 'local'"
            >
              <FolderOpen class="size-3.5" />
              {{ t('import.tabLocal') }}
            </button>
            <button
              :class="[
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
                tab === 'git'
                  ? 'border-foreground bg-foreground text-background'
                  : 'hover:border-foreground/40',
              ]"
              @click="tab = 'git'"
            >
              <GitBranch class="size-3.5" />
              {{ t('import.tabGit') }}
            </button>
          </div>

          <!-- local source -->
          <button
            v-if="tab === 'local'"
            type="button"
            class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40"
            @click="pickLocalDir"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <FolderOpen class="size-6" />
            {{ t('import.dropHint') }}
          </button>

          <!-- git source -->
          <div v-else class="flex gap-2">
            <Input
              v-model="gitUrl"
              class="flex-1 text-sm"
              :placeholder="t('import.gitPh')"
              @keydown.enter="fetchGit"
            />
            <Button size="sm" :disabled="fetching || !gitUrl.trim()" @click="fetchGit">
              {{ fetching ? t('import.fetching') : t('import.fetch') }}
            </Button>
          </div>

          <!-- results -->
          <template v-if="searched">
            <p v-if="items.length === 0" class="text-sm text-muted-foreground">
              {{ t('import.none') }}
            </p>
            <div v-else class="flex flex-col gap-2">
              <p class="text-xs text-muted-foreground">
                {{ t('import.found', { n: items.length }) }}
              </p>
              <label
                v-for="f in items"
                :key="f.dir"
                class="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 accent-foreground"
                  :checked="selected.has(f.dir)"
                  @change="toggleItem(f.dir)"
                />
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="flex items-center gap-2 text-sm font-medium">
                    {{ f.skill.name }}
                    <Badge v-if="f.skill.version" variant="outline">v{{ f.skill.version }}</Badge>
                    <Badge
                      v-if="hasScriptResources(f.skill.resources)"
                      variant="outline"
                      class="border-amber-500/40 text-amber-600 dark:text-amber-400"
                      :title="t('detail.scriptWarning')"
                    >
                      {{ t('import.hasScripts') }}
                    </Badge>
                  </span>
                  <span class="line-clamp-1 text-xs text-muted-foreground">
                    {{ f.skill.description || t('card.noDescription') }}
                  </span>
                  <button
                    type="button"
                    class="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
                    @click.prevent.stop="previewDir = previewDir === f.dir ? null : f.dir"
                  >
                    {{ t('import.viewContent') }} {{ previewDir === f.dir ? '−' : '+' }}
                  </button>
                  <div
                    v-if="previewDir === f.dir"
                    class="markdown-body max-h-56 overflow-auto rounded-md border bg-muted/40 px-3 py-2 text-xs"
                    @click.prevent.stop
                    v-html="md.render(f.skill.content)"
                  />
                  <ul v-if="previewDir === f.dir && f.skill.resources" class="flex flex-col gap-0.5">
                    <li
                      v-for="rel in Object.keys(f.skill.resources)"
                      :key="rel"
                      class="text-xs text-muted-foreground"
                    >
                      <code>{{ rel }}</code>
                    </li>
                  </ul>
                </span>
              </label>

              <span class="mt-2 text-xs text-muted-foreground">{{ t('import.targets') }}</span>
              <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
            </div>
          </template>

          <p v-if="error" class="break-all text-xs text-destructive">{{ error }}</p>
        </div>

        <footer class="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button variant="ghost" size="sm" :disabled="busy" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            :disabled="busy || selected.size === 0 || agents.length === 0"
            @click="runImport"
          >
            {{ busy ? t('import.importing') : t('import.install', { n: selected.size }) }}
          </Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
