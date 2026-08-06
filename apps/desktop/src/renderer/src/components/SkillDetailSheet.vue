<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import MarkdownIt from 'markdown-it'
import { FolderOpen, TriangleAlert, Trash2, X } from '@lucide/vue'
import type { AggregatedSkill } from '@skills-manager/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ skill: AggregatedSkill | null }>()
const emit = defineEmits<{ close: [] }>()

const { detectedPlatforms, install, uninstall } = useSkills()

const md = new MarkdownIt({ linkify: true })
const rendered = computed(() =>
  props.skill ? md.render(props.skill.installations[0]!.skill.content) : '',
)

const installedAgents = computed(
  () => new Set(props.skill?.installations.map((i) => i.agent) ?? []),
)
const installableTargets = computed(() =>
  detectedPlatforms.value.filter((p) => !installedAgents.value.has(p.id)),
)

const selectedTargets = ref<Set<string>>(new Set())
const busy = ref(false)
const actionError = ref<string | null>(null)
const confirmUninstall = ref(false)

watch(
  () => props.skill?.name,
  () => {
    selectedTargets.value = new Set()
    actionError.value = null
    confirmUninstall.value = false
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
    const targets: InstallTarget[] = [...selectedTargets.value].map((agent) => ({
      agent,
      scope: 'user',
    }))
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

async function runUninstall(): Promise<void> {
  if (!props.skill) return
  busy.value = true
  actionError.value = null
  try {
    const targets: InstallTarget[] = props.skill.installations.map((i) => ({
      agent: i.agent,
      scope: i.scope,
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
        class="fixed inset-y-0 right-0 z-50 flex w-[560px] max-w-[90vw] flex-col border-l bg-background shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <template v-if="skill">
          <!-- header -->
          <header class="flex items-start justify-between gap-3 border-b px-6 py-4">
            <div class="min-w-0">
              <DialogTitle class="truncate text-base font-semibold tracking-tight">
                {{ skill.name }}
              </DialogTitle>
              <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {{ skill.description || '（无描述）' }}
              </p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <Badge v-if="skill.version" variant="outline">v{{ skill.version }}</Badge>
                <Badge v-for="tag in skill.tags" :key="tag" variant="outline">{{ tag }}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" class="shrink-0" @click="emit('close')">
              <X />
            </Button>
          </header>

          <div class="flex-1 overflow-y-auto">
            <!-- installations -->
            <section class="border-b px-6 py-4">
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                已安装位置
              </h3>
              <div
                v-if="skill.hasDrift"
                class="mb-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
              >
                <TriangleAlert class="size-3.5 shrink-0" />
                各端内容不一致（漂移）——同步功能即将上线
              </div>
              <ul class="flex flex-col gap-2">
                <li
                  v-for="inst in skill.installations"
                  :key="inst.path"
                  class="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div class="flex min-w-0 items-center gap-2">
                    <PlatformIcon :id="inst.agent" :size="15" class="text-foreground/70" />
                    <span class="shrink-0 text-sm">{{ agentLabel(inst.agent) }}</span>
                    <Badge variant="outline">{{ inst.scope }}</Badge>
                    <code class="truncate text-xs text-muted-foreground/70">{{ inst.path }}</code>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7 shrink-0"
                    title="在 Finder 中显示"
                    @click="reveal(inst.path)"
                  >
                    <FolderOpen class="size-3.5" />
                  </Button>
                </li>
              </ul>
            </section>

            <!-- install to -->
            <section v-if="installableTargets.length > 0" class="border-b px-6 py-4">
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                安装到其他平台
              </h3>
              <div class="flex flex-wrap gap-2">
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
              <Button
                class="mt-3"
                size="sm"
                :disabled="selectedTargets.size === 0 || busy"
                @click="runInstall"
              >
                {{ busy ? '安装中…' : `安装（${selectedTargets.size}）` }}
              </Button>
              <p v-if="actionError" class="mt-2 text-xs text-destructive">{{ actionError }}</p>
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
          <footer class="flex items-center justify-between border-t px-6 py-3">
            <p class="text-xs text-muted-foreground">
              装于 {{ skill.installations.length }} 处
            </p>
            <div class="flex items-center gap-2">
              <template v-if="confirmUninstall">
                <span class="text-xs text-muted-foreground">
                  将删除全部 {{ skill.installations.length }} 处安装，确定？
                </span>
                <Button variant="destructive" size="sm" :disabled="busy" @click="runUninstall">
                  确认删除
                </Button>
                <Button variant="ghost" size="sm" @click="confirmUninstall = false">取消</Button>
              </template>
              <Button
                v-else
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="confirmUninstall = true"
              >
                <Trash2 />
                删除
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
