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
import { X } from '@lucide/vue'
import type { Skill } from '@skills-manager/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { installSkill } = useSkills()
const { t } = useI18n()

const TEMPLATE = `## When to use

<!-- Describe when this skill should activate -->

## Instructions

1. ...
`

const name = ref('')
const description = ref('')
const tagsInput = ref('')
const content = ref(TEMPLATE)
const scope = ref('user')
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = ''
      description.value = ''
      tagsInput.value = ''
      content.value = TEMPLATE
      agents.value = []
      scope.value = 'user'
      error.value = null
    }
  },
)

async function create(): Promise<void> {
  error.value = null
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.value)) {
    error.value = t('newSkill.errName')
    return
  }
  if (agents.value.length === 0) {
    error.value = t('newSkill.errTargets')
    return
  }
  busy.value = true
  try {
    const skill: Skill = {
      name: name.value,
      description: description.value.trim(),
      tags: tagsInput.value
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      content: content.value,
    }
    const targets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const results = await installSkill(skill, targets)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      error.value = failed.map((f) => `${agentLabel(f.target.agent)}: ${f.error}`).join('；')
      return
    }
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
            {{ t('newSkill.title') }}
          </DialogTitle>
          <Button variant="ghost" size="icon" @click="emit('close')"><X /></Button>
        </header>

        <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {{ t('newSkill.name') }}
              <Input v-model="name" class="text-sm" :placeholder="t('newSkill.namePh')" />
            </label>
            <label class="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {{ t('editor.tags') }}
              <Input v-model="tagsInput" class="text-sm" placeholder="git, style" />
            </label>
            <label class="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
              {{ t('editor.description') }}
              <Input
                v-model="description"
                class="text-sm"
                :placeholder="t('editor.descriptionPh')"
              />
            </label>
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-muted-foreground">{{ t('editor.body') }}</span>
            <MarkdownEditor v-model="content" />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-muted-foreground">{{ t('newSkill.targets') }}</span>
            <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
          </div>

          <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
        </div>

        <footer class="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button variant="ghost" size="sm" :disabled="busy" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button size="sm" :disabled="busy || !name || !description.trim()" @click="create">
            {{ busy ? t('newSkill.creating') : t('newSkill.create') }}
          </Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
