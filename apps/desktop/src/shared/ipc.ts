import type { AgentId, InstallScope } from '@skillbuddy/core'

/** Minimal existing-skill context exposed to a local AI agent. */
export interface AiSkillContextItem {
  name: string
  description: string
  agents: string[]
}

/** Context used to initialize a Skill creation conversation. */
export interface AiConversationContext {
  skills: AiSkillContextItem[]
  platforms: { id: string; displayName: string }[]
  editingSkill?: { name: string; sourcePath: string }
}

/** Normalized event stream emitted by local AI agent adapters. */
export type AiConversationEvent =
  | { conversationId: string; type: 'session'; nativeSessionId: string }
  | { conversationId: string; type: 'assistant-delta'; text: string }
  | { conversationId: string; type: 'activity'; label: string }
  | { conversationId: string; type: 'artifact'; items: import('@skillbuddy/core').FoundSkill[] }
  | { conversationId: string; type: 'completed' }
  | { conversationId: string; type: 'cancelled' }
  | { conversationId: string; type: 'error'; message: string }

/** Conversation event before the main process adds its conversation id. */
export type AiConversationEventPayload = AiConversationEvent extends infer Event
  ? Event extends { conversationId: string }
    ? Omit<Event, 'conversationId'>
    : never
  : never

/** A (platform, scope) pair an install/uninstall operation applies to. */
export interface InstallTarget {
  agent: AgentId
  scope: InstallScope
  /** Required when scope is "project". */
  projectRoot?: string
}

/** Registry connection settings passed with each registry IPC call. */
export interface RegistryConfig {
  url: string
  token: string
}

/** A user-defined platform definition persisted in settings. */
export interface CustomPlatformInput {
  id: string
  displayName: string
  userSkillsDir: string | null
  projectSkillsDir: string | null
  detectPath: string
}

/** Per-target outcome of an install/uninstall operation. */
export interface TargetResult {
  target: InstallTarget
  ok: boolean
  error?: string
}
