<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { ArrowLeft, Sparkles } from '@lucide/vue'
import type { Skill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { buildSkillPrompt, parseSkillDraft } from '@/lib/skillGen'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { installSkill, skills, detectedPlatforms } = useSkills()
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

/* ---------- AI drafting via local agent CLI ---------- */

const generators = ref<string[]>([])
const generator = ref('')
const intent = ref('')
const generating = ref(false)
const genError = ref<string | null>(null)

const generatorOptions = computed(() =>
  generators.value.map((id) => ({ value: id, label: agentLabel(id) })),
)

onMounted(async () => {
  // create once, share everywhere: preselect every detected platform
  agents.value = detectedPlatforms.value.map((p) => p.id)
  try {
    generators.value = await window.skillsManager.aiGenerators()
    generator.value = generators.value[0] ?? ''
  } catch {
    generators.value = []
  }
})

async function generate(): Promise<void> {
  if (!intent.value.trim() || !generator.value || generating.value) return
  generating.value = true
  genError.value = null
  try {
    const inventory = skills.value.map((s) => ({
      name: s.name,
      description: s.description ?? '',
    }))
    const prompt = buildSkillPrompt(intent.value.trim(), inventory)
    const { text } = await window.skillsManager.aiGenerate(generator.value, prompt)
    const draft = parseSkillDraft(text)
    name.value = draft.name
    description.value = draft.description
    tagsInput.value = draft.tags.join(', ')
    content.value = draft.content
  } catch (e) {
    genError.value = e instanceof Error ? e.message : String(e)
  } finally {
    generating.value = false
  }
}

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
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex items-center gap-3 border-b px-6 py-3', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft />
      </Button>
      <h1 class="text-base font-semibold tracking-tight">{{ t('newSkill.title') }}</h1>
      <div class="flex-1" />
      <Button variant="ghost" size="sm" class="app-no-drag" :disabled="busy" @click="emit('close')">
        {{ t('common.cancel') }}
      </Button>
      <Button
        size="sm"
        class="app-no-drag"
        :disabled="busy || !name || !description.trim()"
        @click="create"
      >
        {{ busy ? t('newSkill.creating') : t('newSkill.create') }}
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
        <!-- AI draft: primary path — describe intent, local agent writes the skill -->
        <section
          v-if="generators.length > 0"
          class="flex flex-col gap-3 rounded-xl border bg-muted/20 px-5 py-4"
        >
          <div class="flex items-center gap-2">
            <Sparkles class="size-4 text-primary" />
            <h3 class="text-sm font-semibold">{{ t('newSkill.aiDraft') }}</h3>
            <div class="flex-1" />
            <Select
              v-if="generatorOptions.length > 1"
              v-model="generator"
              class="w-fit"
              :options="generatorOptions"
            >
              <template #option="{ option }">
                <span class="flex items-center gap-2">
                  <PlatformIcon :id="option.value" :size="14" />
                  {{ option.label }}
                </span>
              </template>
            </Select>
            <span v-else class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlatformIcon v-if="generator" :id="generator" :size="13" />
              {{ generatorOptions[0]?.label }}
            </span>
          </div>
          <textarea
            v-model="intent"
            rows="3"
            :placeholder="t('newSkill.aiIntentPh')"
            class="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/40"
            :disabled="generating"
          />
          <p v-if="genError" class="break-all text-xs text-destructive">{{ genError }}</p>
          <div class="flex items-center gap-3">
            <Button
              size="sm"
              class="w-fit"
              :disabled="generating || !intent.trim()"
              @click="generate"
            >
              <Sparkles class="size-3.5" />
              {{ generating ? t('newSkill.aiGenerating') : t('newSkill.aiGenerate') }}
            </Button>
            <span v-if="generating" class="text-xs text-muted-foreground">
              {{ t('newSkill.aiGeneratingHint') }}
            </span>
          </div>
        </section>

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
    </ScrollArea>
  </div>
</template>
