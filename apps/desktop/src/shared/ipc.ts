import type {
  AgentId,
  FoundSkill,
  InstallScope,
  McpServerDefinition,
  McpTarget,
} from '@skillbuddy/core'

export interface BackupPreset {
  name: string
  skills: string[]
}

export interface GitBackupRequest {
  remoteUrl: string
  branch: string
  presets: BackupPreset[]
}

export interface GitBackupResult {
  committed: boolean
  skills: number
  presets: number
  commit?: string
}

export interface GitRestorePreview {
  root: string
  createdAt: string
  items: FoundSkill[]
  presets: BackupPreset[]
}

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

/** 魔搭 MCP 广场服务摘要（列表项）。 */
export interface ModelScopeMcpSummary {
  id: string
  name: string
  chineseName: string
  englishName: string
  description: string
  englishDescription: string
  iconUrl: string | null
  tags: string[]
  categories: string[]
  viewCount: number
  /** 可选统计：不同接口版本可能提供调用/下载/收藏等字段。 */
  usageCount?: number
  downloadCount?: number
  favoriteCount?: number
  publisher: string
}

/** 魔搭 MCP 网页端提供、公开列表 OpenAPI 缺失的补充统计。 */
export interface ModelScopeMcpStats {
  id: string
  usageCount?: number
  favoriteCount?: number
  viewCount?: number
}

/** 魔搭 MCP 广场服务详情：在摘要之上补充来源仓库、README 与安装配置。 */
export interface ModelScopeMcpDetail extends ModelScopeMcpSummary {
  author: string
  sourceUrl: string | null
  readme: string
  githubStars: number
  isHosted: boolean
  isVerified: boolean
  /** env_schema 中声明的必填环境变量名。 */
  requiredEnv: string[]
  /** server_config 原样透传，形如 [{ mcpServers: { name: {...} } }]。 */
  configs: unknown[]
}

/** mcp.so 搜索结果卡片。 */
export interface McpSoCard {
  slug: string
  name: string
  author: string
  description: string
  iconUrl: string | null
}

/** mcp.so 详情：页面内嵌的元数据与安装配置 JSON 块。 */
export interface McpSoDetail {
  slug: string
  name: string
  description: string
  author: string
  category: string
  iconUrl: string | null
  sourceUrl: string | null
  configs: unknown[]
}

/** 市场配置转换为平台中立定义后的主进程校验结果。 */
export interface McpMarketValidationResult {
  valid: boolean
  error?: string
}
