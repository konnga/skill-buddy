import type {
  AgentId,
  InstallScope,
  McpServerDefinition,
  McpTarget,
} from '@skillbuddy/core'

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

/** 已授权本地文件可安全返回给渲染进程的预览数据。 */
export type FilePreviewResult =
  | { kind: 'text'; content: string; truncated: boolean }
  | { kind: 'image'; dataUrl: string; mimeType: string; truncated: false }
  | { kind: 'unsupported'; reason: 'binary' | 'too-large'; truncated: false }

export interface McpUpsertPlanRequest {
  projectRoots: string[]
  sourceInstallationId?: string
  definition?: McpServerDefinition
  targets: McpTarget[]
}

export interface McpRemovePlanRequest {
  projectRoots: string[]
  installationIds: string[]
}

export interface McpTogglePlanRequest extends McpRemovePlanRequest {
  enabled: boolean
}

/** 外部链接的打开方式：系统默认浏览器，或应用内浏览器。 */
export type LinkOpenMode = 'external' | 'in-app'

/** 应用内浏览器（WebContentsView）的导航状态，由主进程推送给渲染进程。 */
export interface InAppBrowserState {
  open: boolean
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

/** 应用与运行时版本信息（关于页）。 */
export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
}

/** 检查更新的结果：有新版本 / 已是最新 / 尚无发布 / 出错。 */
export type UpdateCheckResult =
  | { status: 'update'; latest: string; url: string }
  | { status: 'latest'; latest: string; url: string }
  | { status: 'none' }
  | { status: 'error'; message: string }

/** 原生确认对话框参数。 */
export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
}

/** Registry 连接测试结果。 */
export interface RegistryTestResult {
  ok: boolean
  latencyMs: number
  authOk: boolean
  orgs: string[]
  error?: string
}
