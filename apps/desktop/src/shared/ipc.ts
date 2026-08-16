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

/** 一个由 Git 仓库提供的企业团队库。 */
export interface TeamLibraryConfig {
  remoteUrl: string
  branch: string
}

export interface TeamLibraryProbeInput {
  remoteUrl: string
  branch?: string
}

export type TeamLibraryProbeStatus = 'empty' | 'ready' | 'branch-missing' | 'invalid'

export interface TeamLibraryProbeResult {
  status: TeamLibraryProbeStatus
  remoteUrl: string
  branch: string
  defaultBranch?: string
  branches: string[]
  manifest?: TeamLibraryManifest
  error?: string
}

export interface TeamLibraryInitializeInput extends TeamLibraryConfig {
  id: string
  name: string
}

export interface TeamLibraryInitializeResult {
  config: TeamLibraryConfig
  manifest: TeamLibraryManifest
}

export interface TeamLibrarySourceInfo {
  libraryId: string
  libraryName: string
  remoteUrl: string
  branch: string
  revision: string
  path: string
}

export interface TeamLibrarySkillSummary extends TeamLibrarySourceInfo {
  type: 'skill'
  name: string
  description: string
  version?: string
  tags: string[]
  hasScripts: boolean
  contentHash: string
}

export interface TeamLibrarySkill extends TeamLibrarySkillSummary {
  content: string
  resourcePaths: string[]
}

export interface TeamLibraryMcpSummary extends TeamLibrarySourceInfo {
  type: 'mcp'
  name: string
  description: string
  version?: string
  transport: string
  requiredSecrets: string[]
  definitionHash: string
}

export interface TeamLibraryMcp extends TeamLibraryMcpSummary {
  definition: McpServerDefinition
}

export interface TeamLibraryBundleSummary extends TeamLibrarySourceInfo {
  type: 'bundle'
  id: string
  name: string
  description: string
  version?: string
  skills: string[]
  mcpServers: string[]
  missingSkills: string[]
  missingMcpServers: string[]
}

export interface TeamLibraryPolicy {
  required: { skills: string[]; mcp: string[] }
  recommended: { skills: string[]; mcp: string[] }
  blocked: { ref: string; versions?: string; reason: string }[]
}

export interface TeamLibraryManifestTeam {
  id: string
  name: string
}

export interface TeamLibraryManifest {
  version: 1
  id: string
  name: string
  teams: TeamLibraryManifestTeam[]
}

export interface TeamLibraryCatalog {
  source: TeamLibrarySourceInfo
  syncedAt: number
  skills: TeamLibrarySkillSummary[]
  mcpServers: TeamLibraryMcpSummary[]
  bundles: TeamLibraryBundleSummary[]
  manifest: TeamLibraryManifest
  policy: TeamLibraryPolicy
  teamPolicies: Record<string, TeamLibraryPolicy>
}

export interface TeamLibrarySyncResult {
  catalog: TeamLibraryCatalog
  fromCache: boolean
  warning?: string
}

export interface TeamLibrarySkillInstallRecord extends TeamLibrarySourceInfo {
  type: 'skill'
  name: string
  version?: string
  contentHash: string
  target: InstallTarget
  installedAt: number
  status?: TeamLibraryInstallationStatus
  actualHash?: string
}

export interface TeamLibraryMcpInstallRecord extends TeamLibrarySourceInfo {
  type: 'mcp'
  name: string
  version?: string
  definitionHash: string
  target: McpTarget
  installedAt: number
  status?: TeamLibraryInstallationStatus
  actualHash?: string
}

export type TeamLibraryInstallRecord =
  | TeamLibrarySkillInstallRecord
  | TeamLibraryMcpInstallRecord

export type TeamLibraryInstallationStatus = 'current' | 'outdated' | 'missing'

export interface TeamProjectRequirements {
  bundles: string[]
  skills: string[]
  mcp: string[]
}

export interface TeamProjectConfig {
  version: 1
  library?: string
  teams: string[]
  requires: TeamProjectRequirements
  policy?: TeamLibraryPolicy
}

export interface TeamProjectConfigResult {
  projectRoot: string
  configPath: string
  found: boolean
  config?: TeamProjectConfig
  error?: string
}

export interface TeamContributionWorkspace {
  id: string
  libraryId: string
  root: string
  remoteUrl: string
  branch: string
  baseBranch: string
  baseRevision: string
  createdAt: number
  provider: 'github' | 'gitlab' | 'unsupported'
}

export interface TeamContributionPublishResult {
  pushed: boolean
  provider: TeamContributionWorkspace['provider']
  branch: string
  url?: string
  warning?: string
}

export interface TeamContributionChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
}

export interface TeamContributionDiff {
  workspace: TeamContributionWorkspace
  files: TeamContributionChangedFile[]
  patch: string
  issues?: TeamLibraryValidationIssue[]
}

export interface TeamLibraryValidationIssue {
  path: string
  message: string
}

export interface TeamLibrarySkillDraft {
  originalPath?: string
  name: string
  description: string
  version?: string
  tags: string[]
  content: string
}

export interface TeamLibrarySkillImportInput {
  sourcePath: string
  name?: string
}

export interface TeamLibraryMcpDraft {
  originalPath?: string
  version?: string
  description: string
  definition: McpServerDefinition
}

export interface TeamLibraryBundleDraft {
  originalPath?: string
  id: string
  name: string
  description: string
  version?: string
  skills: string[]
  mcp: string[]
}

export interface TeamLibraryPolicyDraft {
  scope?: 'organization' | 'team'
  teamId?: string
  teamName?: string
  policy: TeamLibraryPolicy
}

export interface TeamLibraryMutationResult {
  path: string
  affectedBundles: string[]
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

/** 魔搭 MCP 广场分类聚合项。 */
export interface ModelScopeMcpCategory {
  value: string
  count: number
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
  category: string
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
