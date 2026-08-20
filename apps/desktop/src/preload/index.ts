import { contextBridge, ipcRenderer } from 'electron'
import type {
  AggregatedSkill,
  McpOperationPlanView,
  McpOperationRequestResult,
  McpScanResult,
  McpServerDefinition,
  McpTarget,
  FoundSkill,
  PlatformStatus,
  Skill,
} from '@skillbuddy/core'
import type {
  AiConversationContext,
  AiConversationEvent,
  AppInfo,
  ConfirmOptions,
  CustomPlatformInput,
  DesktopPreferences,
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
  ModelScopeMcpCategory,
  ModelScopeMcpDetail,
  ModelScopeMcpStats,
  ModelScopeMcpSummary,
  TeamLibraryConfig,
  TeamContributionDiff,
  TeamContributionPublishResult,
  TeamContributionWorkspace,
  TeamLibraryBundleDraft,
  TeamLibraryCatalog,
  TeamLibraryInitializeInput,
  TeamLibraryInitializeResult,
  TeamLibraryInstallRecord,
  TeamLibraryMcp,
  TeamLibraryMcpDraft,
  TeamLibraryMutationResult,
  TeamLibraryPolicyDraft,
  TeamLibraryProbeInput,
  TeamLibraryProbeResult,
  TeamLibrarySkill,
  TeamLibrarySkillDraft,
  TeamLibrarySkillImportInput,
  TeamLibrarySyncResult,
  TeamProjectConfigResult,
  TeamProjectConfig,
  TrayCommand,
  TrayStatus,
  TargetResult,
  UpdateCheckResult,
} from '#shared/ipc'
import { plainTeamLibraryConfig } from '#shared/team-library'

const api = {
  teamLibraryProbe: (input: TeamLibraryProbeInput): Promise<TeamLibraryProbeResult> =>
    ipcRenderer.invoke('team-library:probe', {
      remoteUrl: input.remoteUrl,
      ...(input.branch ? { branch: input.branch } : {}),
    }),
  teamLibraryInitialize: (
    input: TeamLibraryInitializeInput,
  ): Promise<TeamLibraryInitializeResult> => ipcRenderer.invoke('team-library:initialize', {
    ...plainTeamLibraryConfig(input),
    id: input.id,
    name: input.name,
  }),
  teamContributionPrepare: (
    config: TeamLibraryConfig,
    branchSlug: string,
  ): Promise<TeamContributionWorkspace> =>
    ipcRenderer.invoke(
      'team-library:contribution-prepare',
      plainTeamLibraryConfig(config),
      branchSlug,
    ),
  teamContributionList: (): Promise<TeamContributionWorkspace[]> =>
    ipcRenderer.invoke('team-library:contribution-list'),
  teamContributionOpen: (id: string): Promise<void> =>
    ipcRenderer.invoke('team-library:contribution-open', id),
  teamContributionDiscard: (id: string): Promise<void> =>
    ipcRenderer.invoke('team-library:contribution-discard', id),
  teamContributionPublish: (
    id: string,
    title: string,
    body: string,
  ): Promise<TeamContributionPublishResult> =>
    ipcRenderer.invoke('team-library:contribution-publish', id, title, body),
  teamContributionDiff: (id: string): Promise<TeamContributionDiff> =>
    ipcRenderer.invoke('team-library:contribution-diff', id),
  teamContributionCatalog: (id: string): Promise<TeamLibraryCatalog> =>
    ipcRenderer.invoke('team-library:contribution-catalog', id),
  teamContributionGetSkill: (id: string, path: string): Promise<TeamLibrarySkillDraft> =>
    ipcRenderer.invoke('team-library:contribution-get-skill', id, path),
  teamContributionGetMcp: (id: string, path: string): Promise<TeamLibraryMcpDraft> =>
    ipcRenderer.invoke('team-library:contribution-get-mcp', id, path),
  teamContributionUpsertSkill: (
    id: string,
    input: TeamLibrarySkillDraft,
  ): Promise<TeamLibraryMutationResult> =>
    ipcRenderer.invoke('team-library:contribution-upsert-skill', id, JSON.parse(JSON.stringify(input))),
  teamContributionImportSkill: (
    id: string,
    input: TeamLibrarySkillImportInput,
  ): Promise<TeamLibraryMutationResult> =>
    ipcRenderer.invoke('team-library:contribution-import-skill', id, { ...input }),
  teamContributionUpsertMcp: (
    id: string,
    input: TeamLibraryMcpDraft,
  ): Promise<TeamLibraryMutationResult> =>
    ipcRenderer.invoke('team-library:contribution-upsert-mcp', id, JSON.parse(JSON.stringify(input))),
  teamContributionUpsertBundle: (
    id: string,
    input: TeamLibraryBundleDraft,
  ): Promise<TeamLibraryMutationResult> =>
    ipcRenderer.invoke('team-library:contribution-upsert-bundle', id, JSON.parse(JSON.stringify(input))),
  teamContributionDelete: (id: string, path: string): Promise<TeamLibraryMutationResult> =>
    ipcRenderer.invoke('team-library:contribution-delete', id, path),
  teamContributionUpdatePolicy: (
    id: string,
    input: TeamLibraryPolicyDraft,
  ): Promise<TeamLibraryMutationResult> =>
    ipcRenderer.invoke('team-library:contribution-policy', id, JSON.parse(JSON.stringify(input))),
  teamProjectConfig: (projectRoot: string): Promise<TeamProjectConfigResult> =>
    ipcRenderer.invoke('team-library:project-config', projectRoot),
  teamProjectConfigWrite: (
    projectRoot: string,
    config: TeamProjectConfig,
  ): Promise<TeamProjectConfigResult> =>
    ipcRenderer.invoke('team-library:project-config-write', projectRoot, JSON.parse(JSON.stringify(config))),
  teamLibrarySync: (config: TeamLibraryConfig): Promise<TeamLibrarySyncResult> =>
    ipcRenderer.invoke('team-library:sync', plainTeamLibraryConfig(config)),
  teamLibraryGetSkill: (config: TeamLibraryConfig, path: string): Promise<TeamLibrarySkill> =>
    ipcRenderer.invoke('team-library:get-skill', plainTeamLibraryConfig(config), path),
  teamLibraryGetMcp: (config: TeamLibraryConfig, path: string): Promise<TeamLibraryMcp> =>
    ipcRenderer.invoke('team-library:get-mcp', plainTeamLibraryConfig(config), path),
  teamLibraryInstallSkill: (
    config: TeamLibraryConfig,
    path: string,
    targets: InstallTarget[],
  ): Promise<TargetResult[]> => ipcRenderer.invoke(
    'team-library:install-skill',
    plainTeamLibraryConfig(config),
    path,
    targets,
  ),
  teamLibraryInstallations: (): Promise<TeamLibraryInstallRecord[]> =>
    ipcRenderer.invoke('team-library:installations'),
  teamLibraryRecordMcpInstall: (
    config: TeamLibraryConfig,
    path: string,
    targets: McpTarget[],
  ): Promise<void> => ipcRenderer.invoke(
    'team-library:record-mcp-install',
    plainTeamLibraryConfig(config),
    path,
    targets,
  ),
  teamLibraryAssertMcpInstall: (
    config: TeamLibraryConfig,
    path: string,
    targets: McpTarget[],
  ): Promise<void> => ipcRenderer.invoke(
    'team-library:assert-mcp-install',
    plainTeamLibraryConfig(config),
    path,
    targets,
  ),
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
  browserState: (): Promise<InAppBrowserState> => ipcRenderer.invoke('browser:state'),
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
  getDesktopPreferences: (): Promise<DesktopPreferences> =>
    ipcRenderer.invoke('system:get-desktop-preferences'),
  setDesktopPreferences: (
    preferences: DesktopPreferences,
  ): Promise<DesktopPreferences> =>
    ipcRenderer.invoke('system:set-desktop-preferences', preferences),
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
    category = '',
  ): Promise<{
    items: ModelScopeMcpSummary[]
    total: number
    categories: ModelScopeMcpCategory[]
  }> => ipcRenderer.invoke('mcp-market:modelscope-search', q, page, category),
  modelscopeMcpStats: (ids: string[]): Promise<ModelScopeMcpStats[]> =>
    ipcRenderer.invoke('mcp-market:modelscope-stats', ids),
  modelscopeMcpDetail: (id: string): Promise<ModelScopeMcpDetail> =>
    ipcRenderer.invoke('mcp-market:modelscope-detail', id),
  mcpsoSearch: (q: string, category = ''): Promise<{ items: McpSoCard[] }> =>
    ipcRenderer.invoke('mcp-market:mcpso-search', q, category),
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
  onSkillsChanged: (callback: (changedAt: number) => void): void => {
    ipcRenderer.on('skills:changed', (_event, changedAt: unknown) => {
      callback(typeof changedAt === 'number' ? changedAt : Date.now())
    })
  },
  updateTrayStatus: (status: TrayStatus): Promise<void> =>
    ipcRenderer.invoke('tray:update-status', status),
  onTrayCommand: (callback: (command: TrayCommand) => void): void => {
    ipcRenderer.on('tray:command', (_event, command: TrayCommand) => callback(command))
  },
  removeTrayCommandListeners: (): void => {
    ipcRenderer.removeAllListeners('tray:command')
  },
}

export type SkillsManagerApi = typeof api

contextBridge.exposeInMainWorld('skillsManager', api)
