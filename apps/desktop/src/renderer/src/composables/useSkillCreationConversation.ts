import { computed, onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AggregatedSkill, FoundSkill, PlatformStatus } from '@skillbuddy/core'
import type { AiConversationEvent } from '../../../shared/ipc.js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  activities: string[]
  streaming?: boolean
  error?: string
}

interface UseSkillCreationConversationOptions {
  skill?: AggregatedSkill
  skills: Readonly<Ref<AggregatedSkill[]>>
  detectedPlatforms: Readonly<Ref<PlatformStatus[]>>
  onContentChange?: () => void
}

export function useSkillCreationConversation(options: UseSkillCreationConversationOptions) {
  const { t } = useI18n()
  const agentsLoading = shallowRef(true)
  const availableAgents = ref<string[]>([])
  const selectedAgent = shallowRef('')
  const conversationId = shallowRef<string | null>(null)
  const nativeSessionId = shallowRef<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const composer = shallowRef(
    options.skill
      ? t('newSkill.chatEditDefault', { name: options.skill.name })
      : t('newSkill.chatDefault'),
  )
  const running = shallowRef(false)
  const activeAssistantId = shallowRef<string | null>(null)
  const artifact = shallowRef<FoundSkill | null>(null)
  const conversationStarted = computed(() => conversationId.value !== null)
  let disposed = false

  function notifyContentChange(): void {
    options.onContentChange?.()
  }

  function currentAssistant(): ChatMessage | undefined {
    return messages.value.find((message) => message.id === activeAssistantId.value)
  }

  function finishAssistant(): void {
    const assistant = currentAssistant()
    if (assistant) assistant.streaming = false
    activeAssistantId.value = null
    running.value = false
    notifyContentChange()
  }

  /**
   * IPC 监听器是窗口级共享入口，只消费当前页面所创建会话的事件。
   */
  function handleConversationEvent(event: AiConversationEvent): void {
    if (event.conversationId !== conversationId.value) return

    if (event.type === 'session') {
      nativeSessionId.value = event.nativeSessionId
      return
    }

    if (event.type === 'assistant-delta') {
      const assistant = currentAssistant()
      if (assistant) assistant.text += event.text
      notifyContentChange()
      return
    }

    if (event.type === 'activity') {
      const assistant = currentAssistant()
      if (assistant && assistant.activities.at(-1) !== event.label) {
        assistant.activities.push(event.label)
      }
      notifyContentChange()
      return
    }

    if (event.type === 'artifact') {
      artifact.value = event.items[0] ?? null
      notifyContentChange()
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

  /**
   * 会话创建可能晚于页面卸载；此时立即释放刚创建的原生会话，避免后台残留。
   */
  async function ensureConversation(): Promise<string | null> {
    if (conversationId.value) return conversationId.value

    const context = {
      skills: options.skills.value.map((skill) => ({
        name: skill.name,
        description: skill.description,
        agents: [...new Set(skill.installations.map((installation) => installation.agent))],
      })),
      platforms: options.detectedPlatforms.value.map((platform) => ({
        id: platform.id,
        displayName: platform.displayName,
      })),
      editingSkill: options.skill
        ? {
            name: options.skill.name,
            sourcePath:
              options.skill.installations.find((installation) => !installation.readOnly)?.path ??
              options.skill.installations[0]!.path,
          }
        : undefined,
    }
    const result = await window.skillsManager.aiConversationCreate(selectedAgent.value, context)
    if (disposed) {
      await window.skillsManager
        .aiConversationDispose(result.conversationId)
        .catch(() => undefined)
      return null
    }

    /** 仅在会话成功创建后保存选择，避免无效 Agent 覆盖上一次可用配置。 */
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
    notifyContentChange()

    try {
      const id = await ensureConversation()
      if (id) await window.skillsManager.aiConversationSend(id, text)
    } catch (error) {
      assistantMessage.error = error instanceof Error ? error.message : String(error)
      finishAssistant()
    }
  }

  async function cancelGeneration(): Promise<void> {
    if (!conversationId.value || !running.value) return
    await window.skillsManager.aiConversationCancel(conversationId.value)
  }

  function setComposer(value: string): void {
    composer.value = value
  }

  function setSelectedAgent(value: string): void {
    if (!conversationId.value) selectedAgent.value = value
  }

  onMounted(async () => {
    window.skillsManager.onAiConversationEvent(handleConversationEvent)
    try {
      const agents = await window.skillsManager.aiConversationAgents()
      if (disposed) return
      availableAgents.value = agents
      const previous = localStorage.getItem('skillbuddy:new-skill-agent')
      selectedAgent.value =
        (previous && agents.includes(previous) ? previous : null) ?? agents[0] ?? ''
    } catch {
      if (!disposed) availableAgents.value = []
    } finally {
      if (!disposed) agentsLoading.value = false
    }
  })

  /** 卸载时同步移除监听，并异步释放本页持有的原生会话。 */
  onBeforeUnmount(() => {
    disposed = true
    window.skillsManager.removeAiConversationListeners()
    if (conversationId.value) {
      void window.skillsManager.aiConversationDispose(conversationId.value).catch(() => undefined)
    }
  })

  return {
    agentsLoading,
    availableAgents,
    selectedAgent,
    conversationStarted,
    nativeSessionId,
    messages,
    composer,
    running,
    artifact,
    setComposer,
    setSelectedAgent,
    sendMessage,
    cancelGeneration,
  }
}
