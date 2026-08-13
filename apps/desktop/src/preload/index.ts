import { contextBridge, ipcRenderer } from 'electron'
import type {
  AggregatedSkill,
  McpOperationPlanView,
  McpOperationRequestResult,
  McpScanResult,
  McpServerDefinition,
  FoundSkill,
  PlatformStatus,
  RegistryBundle,
  RegistryBundleSummary,
  RegistryMcpServer,
  RegistryMcpServerSummary,
  RegistrySkill,
  RegistrySkillSummary,
  Skill,
} from '@skillbuddy/core'
import type {
  AiConversationContext,
  AiConversationEvent,
  AppInfo,
  ConfirmOptions,
  CustomPlatformInput,
  FilePreviewResult,
  GitBackupRequest,
  GitBackupResult,
  GitRestorePreview,
  InAppBrowserState,
  InstallTarget,
  LinkOpenMode,
  McpMarketValidationResult,
  McpRemovePlanRequest,
  McpSoCard,
  McpSoDetail,
  McpTogglePlanRequest,
  McpUpsertPlanRequest,
  ModelScopeMcpDetail,
  ModelScopeMcpSummary,
  RegistryConfig,
  RegistryTestResult,
  TargetResult,
  UpdateCheckResult,
} from '../shared/ipc.js'

const api = {
  pushGitBackup: (request: GitBackupRequest): Promise<GitBackupResult> =>
    ipcRenderer.invoke('backup:push', request),
  prepareGitRestore: (
    request: Pick<GitBackupRequest, 'remoteUrl' | 'branch'>,
  ): Promise<GitRestorePreview> => ipcRenderer.invoke('backup:prepare-restore', request),
  scanMcpServers: (projectRoots: string[] = []): Promise<McpScanResult> =>
    ipcRenderer.invoke('mcp:scan', projectRoots),
  createMcpUpsertPlan: (request: McpUpsertPlanRequest): Promise<McpOperationPlanView> =>
    ipcRenderer.invoke('mcp:plan-upsert', request),
  createMcpRemovePlan: (request: McpRemovePlanRequest): Promise<McpOperationPlanView> =>
    ipcRenderer.invoke('mcp:plan-remove', request),
  createMcpTogglePlan: (request: McpTogglePlanRequest): Promise<McpOperationPlanView> =>
    ipcRenderer.invoke('mcp:plan-toggle', request),
  applyMcpPlan: (planId: string): Promise<McpOperationRequestResult> =>
    ipcRenderer.invoke('mcp:apply-plan', planId),
  restoreMcpOperation: (
    operationId: string,
  ): Promise<{ path: string; ok: boolean; error?: string }[]> =>
    ipcRenderer.invoke('mcp:restore', operationId),
  watchMcpStart: (): Promise<number> => ipcRenderer.invoke('mcp:watch-start'),
  onMcpChanged: (callback: () => void): void => {
    ipcRenderer.on('mcp:changed', () => callback())
  },
  scanSkills: (projectRoots: string[] = []): Promise<AggregatedSkill[]> =>
    ipcRenderer.invoke('skills:scan', projectRoots),
  listPlatforms: (): Promise<PlatformStatus[]> => ipcRenderer.invoke('platforms:list'),
  registerPlatforms: (defs: CustomPlatformInput[]): Promise<void> =>
    ipcRenderer.invoke('platforms:register', defs),
  installSkill: (skill: Skill, targets: InstallTarget[]): Promise<TargetResult[]> =>
    ipcRenderer.invoke('skills:install', skill, targets),
  uninstallSkill: (name: string, targets: InstallTarget[]): Promise<TargetResult[]> =>
    ipcRenderer.invoke('skills:uninstall', name, targets),
  setSkillEnabled: (
    name: string,
    targets: InstallTarget[],
    enabled: boolean,
  ): Promise<TargetResult[]> => ipcRenderer.invoke('skills:set-enabled', name, targets, enabled),
  revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('skills:reveal', path),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-directory'),
  findSkillsInDir: (root: string): Promise<FoundSkill[]> =>
    ipcRenderer.invoke('skills:find-in-dir', root),
  importFromGit: (url: string): Promise<{ root: string; items: FoundSkill[] }> =>
    ipcRenderer.invoke('skills:import-git', url),
  cleanupImport: (root: string): Promise<void> =>
    ipcRenderer.invoke('skills:cleanup-import', root),
  aiConversationAgents: (): Promise<string[]> => ipcRenderer.invoke('ai:conversation-agents'),
  aiConversationCreate: (
    agentId: string,
    context: AiConversationContext,
  ): Promise<{ conversationId: string }> =>
    ipcRenderer.invoke('ai:conversation-create', agentId, context),
  aiConversationSend: (conversationId: string, message: string): Promise<void> =>
    ipcRenderer.invoke('ai:conversation-send', conversationId, message),
  aiConversationCancel: (conversationId: string): Promise<boolean> =>
    ipcRenderer.invoke('ai:conversation-cancel', conversationId),
  aiConversationDispose: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke('ai:conversation-dispose', conversationId),
  onAiConversationEvent: (callback: (event: AiConversationEvent) => void): void => {
    ipcRenderer.on('ai:conversation-event', (_event, payload: AiConversationEvent) => {
      callback(payload)
    })
  },
  removeAiConversationListeners: (): void => {
    ipcRenderer.removeAllListeners('ai:conversation-event')
  },
  marketSearch: (
    q: string,
  ): Promise<{ id: string; skillId: string; name: string; installs: number; source: string }[]> =>
    ipcRenderer.invoke('market:search', q),
  githubSearch: (
    q: string,
    page = 1,
  ): Promise<{
    items: {
      fullName: string
      name: string
      description: string
      stars: number
      updatedAt: string | null
      defaultBranch: string
      avatarUrl: string | null
      htmlUrl: string
    }[]
    total: number
  }> => ipcRenderer.invoke('market:github-search', q, page),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  /** 按用户「打开链接方式」设置分流（默认浏览器 / 应用内浏览器）。 */
  openLink: (url: string): Promise<void> => ipcRenderer.invoke('links:open', url),
  setLinkOpenMode: (mode: LinkOpenMode): Promise<void> =>
    ipcRenderer.invoke('links:set-mode', mode),
  browserClose: (): Promise<void> => ipcRenderer.invoke('browser:close'),
  browserBack: (): Promise<void> => ipcRenderer.invoke('browser:back'),
  browserForward: (): Promise<void> => ipcRenderer.invoke('browser:forward'),
  browserReload: (): Promise<void> => ipcRenderer.invoke('browser:reload'),
  onBrowserState: (callback: (state: InAppBrowserState) => void): void => {
    ipcRenderer.on('browser:state', (_event, state: InAppBrowserState) => callback(state))
  },
  setTheme: (mode: 'system' | 'light' | 'dark'): Promise<void> =>
    ipcRenderer.invoke('theme:set', mode),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  checkUpdate: (): Promise<UpdateCheckResult> => ipcRenderer.invoke('app:check-update'),
  getLoginItem: (): Promise<boolean> => ipcRenderer.invoke('system:get-login-item'),
  setLoginItem: (openAtLogin: boolean): Promise<void> =>
    ipcRenderer.invoke('system:set-login-item', openAtLogin),
  /** 注册全局唤起快捷键，返回是否注册成功（空串表示清除）。 */
  setGlobalShortcut: (accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke('system:set-global-shortcut', accelerator),
  setProxy: (url: string): Promise<void> => ipcRenderer.invoke('network:set-proxy', url),
  exportConfig: (content: string): Promise<boolean> =>
    ipcRenderer.invoke('config:export', content),
  importConfig: (): Promise<string | null> => ipcRenderer.invoke('config:import'),
  confirmDialog: (options: ConfirmOptions): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', options),
  openUserData: (): Promise<void> => ipcRenderer.invoke('system:open-user-data'),
  registryTest: (cfg: RegistryConfig): Promise<RegistryTestResult> =>
    ipcRenderer.invoke('registry:test', cfg),
  fetchBundlesManifest: (url: string): Promise<unknown> =>
    ipcRenderer.invoke('bundles:manifest', url),
  skillhubSearch: (
    q: string,
    page = 1,
  ): Promise<{
    items: {
      slug: string
      namespace: string
      canonicalName: string
      name: string
      description: string
      installs: number
      stars: number
      upstreamUrl: string | null
      iconUrl: string | null
      version: string | null
      updatedAt: number | null
      verified: boolean
      requiresApiKey: boolean
      tags: string[]
    }[]
    total: number
  }> => ipcRenderer.invoke('market:skillhub-search', q, page),
  githubStars: (repos: string[]): Promise<Record<string, number>> =>
    ipcRenderer.invoke('market:github-stars', repos),
  modelscopeMcpSearch: (
    q: string,
    page = 1,
  ): Promise<{ items: ModelScopeMcpSummary[]; total: number }> =>
    ipcRenderer.invoke('mcp-market:modelscope-search', q, page),
  modelscopeMcpDetail: (id: string): Promise<ModelScopeMcpDetail> =>
    ipcRenderer.invoke('mcp-market:modelscope-detail', id),
  mcpsoSearch: (q: string): Promise<{ items: McpSoCard[] }> =>
    ipcRenderer.invoke('mcp-market:mcpso-search', q),
  mcpsoDetail: (slug: string): Promise<McpSoDetail> =>
    ipcRenderer.invoke('mcp-market:mcpso-detail', slug),
  validateMcpMarketDefinitions: (
    definitions: McpServerDefinition[],
  ): Promise<McpMarketValidationResult[]> =>
    ipcRenderer.invoke('mcp-market:validate-definitions', definitions),
  skillhubVersions: (
    slug: string,
    namespace: string,
  ): Promise<
    {
      version: string
      changelog: string
      createdAt: number | null
      security: { name: string; status: string; statusText: string; reportUrl: string }[]
    }[]
  > => ipcRenderer.invoke('market:skillhub-versions', slug, namespace),
  skillhubFetch: (
    slug: string,
    namespace: string,
  ): Promise<{ root: string; items: FoundSkill[] }> =>
    ipcRenderer.invoke('market:skillhub-fetch', slug, namespace),
  registrySearch: (cfg: RegistryConfig, q?: string): Promise<RegistrySkillSummary[]> =>
    ipcRenderer.invoke('registry:search', cfg, q),
  registryOrgs: (cfg: RegistryConfig): Promise<{ name: string; displayName: string }[]> =>
    ipcRenderer.invoke('registry:orgs', cfg),
  registryInstall: (
    cfg: RegistryConfig,
    org: string,
    name: string,
    targets: InstallTarget[],
  ): Promise<TargetResult[]> => ipcRenderer.invoke('registry:install', cfg, org, name, targets),
  registryRequired: (cfg: RegistryConfig, org: string): Promise<string[]> =>
    ipcRenderer.invoke('registry:required', cfg, org),
  registryGet: (cfg: RegistryConfig, org: string, name: string): Promise<RegistrySkill> =>
    ipcRenderer.invoke('registry:get', cfg, org, name),
  registryVersions: (
    cfg: RegistryConfig,
    org: string,
    name: string,
  ): Promise<{ version: string; publishedBy: string; createdAt: number }[]> =>
    ipcRenderer.invoke('registry:versions', cfg, org, name),
  registryMcpSearch: (
    cfg: RegistryConfig,
    q?: string,
  ): Promise<RegistryMcpServerSummary[]> => ipcRenderer.invoke('registry:mcp-search', cfg, q),
  registryMcpGet: (
    cfg: RegistryConfig,
    org: string,
    name: string,
    version?: string,
  ): Promise<RegistryMcpServer> => ipcRenderer.invoke('registry:mcp-get', cfg, org, name, version),
  registryMcpVersions: (
    cfg: RegistryConfig,
    org: string,
    name: string,
  ): Promise<{ version: string; publishedBy: string; createdAt: number }[]> =>
    ipcRenderer.invoke('registry:mcp-versions', cfg, org, name),
  registryMcpPublish: (
    cfg: RegistryConfig,
    org: string,
    definition: McpServerDefinition,
    version: string,
    description?: string,
  ): Promise<void> =>
    ipcRenderer.invoke('registry:mcp-publish', cfg, org, definition, version, description),
  registryRequiredMcp: (cfg: RegistryConfig, org: string): Promise<string[]> =>
    ipcRenderer.invoke('registry:required-mcp', cfg, org),
  registrySetRequiredMcp: (cfg: RegistryConfig, org: string, names: string[]): Promise<void> =>
    ipcRenderer.invoke('registry:set-required-mcp', cfg, org, names),
  registryBundles: (cfg: RegistryConfig): Promise<RegistryBundleSummary[]> =>
    ipcRenderer.invoke('registry:bundles', cfg),
  registryBundleGet: (
    cfg: RegistryConfig,
    org: string,
    name: string,
    version?: string,
  ): Promise<RegistryBundle> => ipcRenderer.invoke('registry:bundle-get', cfg, org, name, version),
  watchStart: (projectRoots: string[]): Promise<number> =>
    ipcRenderer.invoke('watch:start', projectRoots),
  secureGet: (key: string): Promise<string> => ipcRenderer.invoke('secure:get', key),
  secureSet: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('secure:set', key, value),
  trashUndoable: (
    paths: string[],
  ): Promise<{ token: string; results: { path: string; ok: boolean; error?: string }[] }> =>
    ipcRenderer.invoke('skills:trash-undoable', paths),
  undoTrash: (token: string): Promise<boolean> => ipcRenderer.invoke('skills:undo-trash', token),
  trashPaths: (paths: string[]): Promise<{ path: string; ok: boolean; error?: string }[]> =>
    ipcRenderer.invoke('skills:trash', paths),
  readFile: (path: string): Promise<{ content: string; truncated: boolean }> =>
    ipcRenderer.invoke('file:read', path),
  previewFile: (path: string): Promise<FilePreviewResult> =>
    ipcRenderer.invoke('file:preview', path),
  listTree: (root: string): Promise<{ path: string; size: number; isDir: boolean }[]> =>
    ipcRenderer.invoke('file:list-tree', root),
  onSkillsChanged: (callback: () => void): void => {
    ipcRenderer.on('skills:changed', () => callback())
  },
  registryPublish: (
    cfg: RegistryConfig,
    org: string,
    skill: Skill,
    version: string,
  ): Promise<void> => ipcRenderer.invoke('registry:publish', cfg, org, skill, version),
}

export type SkillsManagerApi = typeof api

contextBridge.exposeInMainWorld('skillsManager', api)
