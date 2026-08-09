<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  ArrowUp,
  Check,
  FileText,
  Hammer,
  LoaderCircle,
  Sparkles,
  Square,
  Terminal,
} from '@lucide/vue'
import type { AggregatedSkill, FoundSkill } from '@skillbuddy/core'
import type { AiConversationEvent, InstallTarget } from '../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  activities: string[]
  streaming?: boolean
  error?: string
}

const props = defineProps<{ inset?: boolean; skill?: AggregatedSkill }>()
const emit = defineEmits<{ close: [] }>()

const { detectedPlatforms, installSkill, skills } = useSkills()
const { t } = useI18n()

const agentsLoading = ref(true)
const availableAgents = ref<string[]>([])
const selectedAgent = ref('')
const conversationId = ref<string | null>(null)
const nativeSessionId = ref<string | null>(null)
const messages = ref<ChatMessage[]>([])
const composer = ref(
  props.skill
    ? t('newSkill.chatEditDefault', { name: props.skill.name })
    : t('newSkill.chatDefault'),
)
const running = ref(false)
const scrollElement = ref<HTMLElement | null>(null)
const activeAssistantId = ref<string | null>(null)

const artifact = ref<FoundSkill | null>(null)
const scope = ref('user')
const targetAgents = ref<string[]>([])
const installing = ref(false)
const installError = ref<string | null>(null)
const installedKey = ref<string | null>(null)

const agentOptions = computed(() =>
  availableAgents.value.map((id) => ({ value: id, label: agentLabel(id) })),
)

const artifactRevision = computed(() => {
  if (!artifact.value) return ''
  const skill = artifact.value.skill
  return JSON.stringify({
    name: skill.name,
    description: skill.description,
    content: skill.content,
    resources: Object.keys(skill.resources ?? {}).sort(),
  })
})

const currentInstallKey = computed(() =>
  JSON.stringify({
    revision: artifactRevision.value,
    scope: scope.value,
    agents: [...targetAgents.value].sort(),
  }),
)

const artifactInstalled = computed(
  () => artifactRevision.value !== '' && currentInstallKey.value === installedKey.value,
)

function scrollToBottom(): void {
  void nextTick(() => {
    const element = scrollElement.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function currentAssistant(): ChatMessage | undefined {
  return messages.value.find((message) => message.id === activeAssistantId.value)
}

function finishAssistant(): void {
  const assistant = currentAssistant()
  if (assistant) assistant.streaming = false
  activeAssistantId.value = null
  running.value = false
  scrollToBottom()
}

function handleConversationEvent(event: AiConversationEvent): void {
  if (event.conversationId !== conversationId.value) return

  if (event.type === 'session') {
    nativeSessionId.value = event.nativeSessionId
    return
  }

  if (event.type === 'assistant-delta') {
    const assistant = currentAssistant()
    if (assistant) assistant.text += event.text
    scrollToBottom()
    return
  }

  if (event.type === 'activity') {
    const assistant = currentAssistant()
    if (assistant && assistant.activities.at(-1) !== event.label) {
      assistant.activities.push(event.label)
    }
    scrollToBottom()
    return
  }

  if (event.type === 'artifact') {
    artifact.value = event.items[0] ?? null
    installError.value = null
    scrollToBottom()
    return
  }

  if (event.type === 'error') {
    const assistant = currentAssistant()
    if (assistant) assistant.error = event.message
    finishAssistant()
    return
  }

  if (event.type === 'cancelled') {
    const assistant = currentAssistant()
    if (assistant && !assistant.text) assistant.text = t('newSkill.chatCancelled')
    finishAssistant()
    return
  }

  finishAssistant()
}

async function ensureConversation(): Promise<string> {
  if (conversationId.value) return conversationId.value

  const context = {
    skills: skills.value.map((skill) => ({
      name: skill.name,
      description: skill.description,
      agents: [...new Set(skill.installations.map((installation) => installation.agent))],
    })),
    platforms: detectedPlatforms.value.map((platform) => ({
      id: platform.id,
      displayName: platform.displayName,
    })),
    editingSkill: props.skill
      ? {
          name: props.skill.name,
          sourcePath:
            props.skill.installations.find((installation) => !installation.readOnly)?.path ??
            props.skill.installations[0]!.path,
        }
      : undefined,
  }
  const result = await window.skillsManager.aiConversationCreate(selectedAgent.value, context)
  localStorage.setItem('skillbuddy:new-skill-agent', selectedAgent.value)
  conversationId.value = result.conversationId
  return result.conversationId
}

async function sendMessage(): Promise<void> {
  const text = composer.value.trim()
  if (!text || running.value || !selectedAgent.value) return

  composer.value = ''
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    text,
    activities: [],
  }
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    text: '',
    activities: [],
    streaming: true,
  }
  messages.value.push(userMessage, assistantMessage)
  activeAssistantId.value = assistantMessage.id
  running.value = true
  scrollToBottom()

  try {
    const id = await ensureConversation()
    await window.skillsManager.aiConversationSend(id, text)
  } catch (error) {
    assistantMessage.error = error instanceof Error ? error.message : String(error)
    finishAssistant()
  }
}

async function cancelGeneration(): Promise<void> {
  if (!conversationId.value || !running.value) return
  await window.skillsManager.aiConversationCancel(conversationId.value)
}

async function installArtifact(): Promise<void> {
  if (!artifact.value || targetAgents.value.length === 0 || installing.value) return
  installing.value = true
  installError.value = null
  try {
    const targets: InstallTarget[] = targetAgents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const results = await installSkill(artifact.value.skill, targets)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      installError.value = failed
        .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
        .join('；')
      return
    }
    installedKey.value = currentInstallKey.value
  } catch (error) {
    installError.value = error instanceof Error ? error.message : String(error)
  } finally {
    installing.value = false
  }
}

function onComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void sendMessage()
}

onMounted(async () => {
  targetAgents.value = detectedPlatforms.value.map((platform) => platform.id)
  window.skillsManager.onAiConversationEvent(handleConversationEvent)
  try {
    availableAgents.value = await window.skillsManager.aiConversationAgents()
    const previous = localStorage.getItem('skillbuddy:new-skill-agent')
    selectedAgent.value =
      (previous && availableAgents.value.includes(previous) ? previous : null) ??
      availableAgents.value[0] ??
      ''
  } catch {
    availableAgents.value = []
  } finally {
    agentsLoading.value = false
  }
})

onBeforeUnmount(() => {
  window.skillsManager.removeAiConversationListeners()
  if (conversationId.value) {
    void window.skillsManager.aiConversationDispose(conversationId.value).catch(() => undefined)
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag"
        :title="t('common.cancel')"
        @click="emit('close')"
      >
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <div class="flex h-9 min-w-0 flex-col justify-center">
        <h1 class="truncate text-sm font-semibold leading-5">
          {{
            props.skill
              ? t('newSkill.chatEditTitle', { name: props.skill.name })
              : t('newSkill.chatTitle')
          }}
        </h1>
        <p v-if="nativeSessionId" class="truncate text-[11px] leading-4 text-muted-foreground">
          {{ t('newSkill.sessionActive') }}
        </p>
      </div>
      <div class="flex-1" />
    </header>

    <div ref="scrollElement" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-8 pt-7">
        <div
          v-if="messages.length === 0"
          class="flex flex-1 flex-col items-center justify-center pb-20 text-center"
        >
          <div class="mb-4 flex size-10 items-center justify-center rounded-lg border bg-muted/30">
            <Sparkles class="size-5" />
          </div>
          <h2 class="text-base font-semibold">
            {{ props.skill ? t('newSkill.emptyEditTitle') : t('newSkill.emptyTitle') }}
          </h2>
          <p class="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            {{ props.skill ? t('newSkill.emptyEditHint') : t('newSkill.emptyHint') }}
          </p>
          <p v-if="!agentsLoading && availableAgents.length === 0" class="mt-4 text-sm text-destructive">
            {{ t('newSkill.noAgent') }}
          </p>
        </div>

        <div v-else class="flex flex-col gap-8">
          <template v-for="message in messages" :key="message.id">
            <div v-if="message.role === 'user'" class="flex justify-end">
              <div class="max-w-[82%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-2.5 text-sm leading-6">
                {{ message.text }}
              </div>
            </div>

            <article v-else class="min-w-0">
              <MarkdownView
                v-if="message.text"
                :content="message.text"
                :preview-id="`ai-message-${message.id}`"
              />
              <div v-if="message.activities.length > 0" class="mt-3 flex flex-col gap-1.5">
                <div
                  v-for="(activity, index) in message.activities"
                  :key="`${activity}-${index}`"
                  class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
                >
                  <Terminal class="size-3.5 shrink-0" />
                  <span class="truncate font-mono">{{ activity }}</span>
                </div>
              </div>
              <div v-if="message.streaming" class="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle class="size-3.5 animate-spin" />
                {{ t('newSkill.thinking') }}
              </div>
              <p v-if="message.error" class="mt-3 break-all text-sm text-destructive">
                {{ message.error }}
              </p>
            </article>
          </template>

          <section v-if="artifact" class="overflow-hidden rounded-lg border">
            <div class="flex items-start gap-3 border-b bg-muted/20 px-4 py-3">
              <FileText class="mt-0.5 size-4 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-sm font-semibold">{{ artifact.skill.name }}</h3>
                  <span
                    v-if="artifactInstalled"
                    class="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"
                  >
                    <Check class="size-3.5" />
                    {{ t('newSkill.installed') }}
                  </span>
                </div>
                <p class="mt-1 text-sm leading-5 text-muted-foreground">
                  {{ artifact.skill.description }}
                </p>
              </div>
            </div>
            <div class="max-h-80 overflow-y-auto px-4 py-3">
              <MarkdownView
                :content="artifact.skill.content"
                preview-id="new-skill-artifact"
              />
            </div>
            <div class="flex flex-col gap-3 border-t px-4 py-3">
              <PlatformTargetPicker
                v-model:scope="scope"
                v-model:agents="targetAgents"
                :label="t('team.installTo')"
              />
              <div class="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  :disabled="installing || targetAgents.length === 0 || artifactInstalled"
                  @click="installArtifact"
                >
                  <LoaderCircle v-if="installing" class="size-3.5 animate-spin" />
                  <Check v-else class="size-3.5" />
                  {{
                    artifactInstalled
                      ? t('newSkill.installed')
                      : installing
                        ? t('newSkill.installing')
                        : t('newSkill.installN', { n: targetAgents.length })
                  }}
                </Button>
                <p v-if="installError" class="break-all text-sm text-destructive">
                  {{ installError }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <footer class="shrink-0 bg-background px-6 pb-4 pt-2">
      <div
        class="mx-auto flex max-w-3xl flex-col rounded-[22px] border border-foreground/15 bg-background shadow-[0_8px_32px_rgb(0_0_0/0.08)] transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-[0_10px_36px_rgb(0_0_0/0.11)] dark:shadow-[0_8px_32px_rgb(0_0_0/0.28)]"
      >
        <div class="flex min-h-14 items-start gap-2 px-5 pb-1 pt-4">
          <span
            class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2 text-sm font-medium leading-none text-foreground/80"
          >
            <Hammer class="size-3.5" />
            skillbuddy-skill-creator
          </span>
          <textarea
            v-model="composer"
            rows="2"
            :placeholder="t('newSkill.chatPlaceholder')"
            class="min-h-10 min-w-0 flex-1 resize-none bg-transparent p-0 text-sm leading-6 outline-none placeholder:text-muted-foreground/45"
            :disabled="agentsLoading || availableAgents.length === 0"
            @keydown="onComposerKeydown"
          />
        </div>
        <div class="flex h-10 items-center px-4 pb-2">
          <Select
            v-if="selectedAgent"
            v-model="selectedAgent"
            class="inline-flex h-7 w-fit min-w-0 self-center border-0 bg-transparent py-0 pl-2 pr-1.5 text-sm leading-none text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus-visible:ring-0"
            :options="agentOptions"
            :disabled="Boolean(conversationId)"
          >
            <template #value="{ option }">
              <span v-if="option" class="inline-flex h-full items-center gap-1.5">
                <PlatformIcon :id="option.value" :size="13" class="shrink-0" />
                <span class="leading-none">{{ option.label }}</span>
              </span>
            </template>
            <template #option="{ option }">
              <span class="flex items-center gap-2">
                <PlatformIcon :id="option.value" :size="14" class="shrink-0" />
                <span class="leading-none">{{ option.label }}</span>
              </span>
            </template>
          </Select>
          <div class="flex-1" />
          <Button
            v-if="running"
            size="icon"
            class="size-7 rounded-full border-0 bg-foreground text-background hover:bg-foreground/90 hover:text-background"
            :title="t('newSkill.stop')"
            @click="cancelGeneration"
          >
            <Square class="size-3.5 fill-current" />
          </Button>
          <Button
            v-else
            size="icon"
            class="size-7 rounded-full"
            :title="t('newSkill.send')"
            :disabled="!composer.trim() || !selectedAgent"
            @click="sendMessage"
          >
            <ArrowUp class="size-4" />
          </Button>
        </div>
      </div>
    </footer>
  </div>
</template>
