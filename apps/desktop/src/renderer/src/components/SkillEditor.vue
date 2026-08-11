<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { Maximize2, Minimize2 } from '@lucide/vue'
import type { AggregatedSkill, Skill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ skill: AggregatedSkill }>()
const emit = defineEmits<{ done: [] ; cancel: [] }>()

const { installSkill } = useSkills()
const { t } = useI18n()

const writableInstallations = props.skill.installations.filter((installation) => !installation.readOnly)
const source = writableInstallations[0]!
const description = ref(props.skill.description)
const version = ref(props.skill.version ?? '')
const tagsInput = ref(props.skill.tags.join(', '))
const content = ref(source.skill.content)

/** Which installations to write to — default: all (keeps ends in sync). */
const targetPaths = ref<Set<string>>(new Set(writableInstallations.map((i) => i.path)))
const busy = ref(false)
const error = ref<string | null>(null)
const editorExpanded = shallowRef(false)
const markdownEditor = useTemplateRef<InstanceType<typeof MarkdownEditor>>('markdownEditor')

const multiInstalled = computed(() => writableInstallations.length > 1)

async function toggleEditorExpanded(): Promise<void> {
  editorExpanded.value = !editorExpanded.value
  await nextTick()
  markdownEditor.value?.focus()
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !editorExpanded.value) return
  event.preventDefault()
  event.stopPropagation()
  void toggleEditorExpanded()
}

onMounted(() => window.addEventListener('keydown', onEditorKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onEditorKeydown, true))

function toggle(path: string): void {
  const next = new Set(targetPaths.value)
  if (next.has(path)) {
    if (next.size === 1) return // at least one target
    next.delete(path)
  } else {
    next.add(path)
  }
  targetPaths.value = next
}

async function save(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    const payload: Skill = {
      name: props.skill.name,
      description: description.value.trim(),
      version: version.value.trim() || undefined,
      tags: tagsInput.value
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      content: content.value,
      resources: source.skill.resources,
    }
    const targets: InstallTarget[] = writableInstallations
      .filter((i) => targetPaths.value.has(i.path))
      .map((i) => ({ agent: i.agent, scope: i.scope, projectRoot: i.projectRoot }))
    const results = await installSkill(payload, targets)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      error.value = failed.map((f) => `${agentLabel(f.target.agent)}: ${f.error}`).join('；')
      return
    }
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 px-6 py-4">
    <div class="grid grid-cols-2 gap-3">
      <label class="col-span-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
        {{ t('editor.description') }}
        <textarea
          v-model="description"
          rows="3"
          class="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-5 text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          :placeholder="t('editor.descriptionPh')"
        />
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {{ t('editor.version') }}
        <Input v-model="version" class="text-sm" :placeholder="t('editor.versionPh')" />
      </label>
      <label class="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {{ t('editor.tags') }}
        <Input v-model="tagsInput" class="text-sm" placeholder="git, style" />
      </label>
    </div>

    <Teleport to="body" :disabled="!editorExpanded">
      <div
        :class="[
          editorExpanded
            ? 'fixed inset-0 z-[80] flex flex-col bg-background px-6 pb-6 pt-12'
            : 'flex flex-col gap-1.5',
        ]"
      >
        <div class="flex shrink-0 items-center justify-between gap-3">
          <span class="text-sm text-muted-foreground">{{ t('editor.body') }}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 shrink-0"
            :aria-pressed="editorExpanded"
            :aria-label="t(editorExpanded ? 'editor.collapseEditor' : 'editor.expandEditor')"
            :title="t(editorExpanded ? 'editor.collapseEditor' : 'editor.expandEditor')"
            @click="toggleEditorExpanded"
          >
            <Minimize2 v-if="editorExpanded" class="size-4" />
            <Maximize2 v-else class="size-4" />
          </Button>
        </div>
        <div :class="editorExpanded && 'min-h-0 flex-1'">
          <MarkdownEditor
            ref="markdownEditor"
            v-model="content"
            :height="editorExpanded ? '100%' : 'clamp(520px, 60vh, 720px)'"
          />
        </div>
      </div>
    </Teleport>

    <div v-if="multiInstalled" class="flex flex-col gap-2 rounded-md border px-3 py-2.5">
      <span class="text-sm text-muted-foreground">{{ t('editor.saveTo') }}</span>
      <label
        v-for="inst in writableInstallations"
        :key="inst.path"
        class="flex cursor-pointer items-center gap-2 text-sm"
      >
        <input
          type="checkbox"
          :checked="targetPaths.has(inst.path)"
          class="accent-foreground"
          @change="toggle(inst.path)"
        />
        <PlatformIcon :id="inst.agent" :size="14" />
        {{ agentLabel(inst.agent) }}
        <Badge variant="outline">{{ inst.scope }}</Badge>
      </label>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <div class="flex items-center justify-end gap-2 pb-2">
      <Button variant="ghost" size="sm" :disabled="busy" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </Button>
      <Button size="sm" :disabled="busy || !description.trim()" @click="save">
        {{ busy ? t('editor.saving') : t('editor.saveN', { n: targetPaths.size }) }}
      </Button>
    </div>
  </div>
</template>
