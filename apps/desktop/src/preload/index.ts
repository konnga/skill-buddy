import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  SkillParseWarning,
} from '@skillbuddy/core'
import type {
  AiConversationContext,
  AiConversationEvent,
  EffectiveInstructionChain,
  AppInfo,
  ConfirmOptions,
  CustomPlatformInput,
  DesktopPreferences,
  FilePreviewResult,
  GitBackupRequest,
  GitBackupResult,
  GitInstructionRestoreRequest,
  GitInstructionRestoreResult,
  GitRestorePreview,
  InAppBrowserState,
  InstallTarget,
  InstructionBridgePlanRequest,
  InstructionEffectiveChainRequest,
  InstructionDeletePlanRequest,
  InstructionOperationPlanView,
  InstructionOperationResult,
  InstructionReadRequest,
  InstructionRuleProfile,
  InstructionReadResult,
  InstructionScanRequest,
  InstructionWritePlanRequest,
  LinkOpenMode,
  McpMarketValidationResult,
  McpRemovePlanRequest,
  McpSetSecretRequest,
  McpSoCard,
  McpSoDetail,
  McpTogglePlanRequest,
  McpUpsertPlanRequest,
  ModelScopeMcpCategory,
  ModelScopeMcpDetail,
  ModelScopeMcpStats,
  ModelScopeMcpSummary,
  PlatformCleanupResult,
  PlatformDraft,
  TeamLibraryConfig,
  TeamContributionDiff,
  TeamContributionPublishResult,
  TeamContributionWorkspace,
  TeamLibraryBundleDraft,
  TeamLibraryCatalog,
  TeamLibraryInitializeInput,
  TeamLibraryInitializeResult,
  TeamLibraryInstruction,
  TeamLibraryInstructionDraft,
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
  InstructionServiceScan,
  TeamProjectConfigResult,
  TeamProjectConfig,
  TrayCommand,
  TrayStatus,
  TargetResult,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateDownloadResult,
} from '#shared/ipc'
import { plainTeamLibraryConfig } from '#shared/team-library'
import type { McpPackageProgress, McpPackageScanRequest, McpPackageScanResult } from '#shared/mcp-packages'

/**
 * Electron 会把主进程抛出的错误包装成
 * `Error invoking remote method 'channel': Error: 原始消息`，
 * 这层前缀对用户没有意义，在 IPC 边界统一剥掉，避免每个展示点各自处理。
 */
export function unwrapIpcError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:Error|TypeError|RangeError):\s*/, '')
    .trim()
  return new Error(message || raw)
}

/** 统一的 IPC 调用入口，保持与 ipcRenderer.invoke 相同的调用形态。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke(channel: string, ...args: unknown[]): Promise<any> {
  return ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
    throw unwrapIpcError(error)
  })
}

const api = {
  teamLibraryProbe: (input: TeamLibraryProbeInput): Promise<TeamLibraryProbeResult> =>
    invoke('team-library:probe', {
      remoteUrl: input.remoteUrl,
      ...(input.branch ? { branch: input.branch } : {}),
    }),
  teamLibraryInitialize: (
    input: TeamLibraryInitializeInput,
  ): Promise<TeamLibraryInitializeResult> => invoke('team-library:initialize', {
    ...plainTeamLibraryConfig(input),
    id: input.id,
    name: input.name,
  }),
  teamContributionPrepare: (
    config: TeamLibraryConfig,
    branchSlug: string,
  ): Promise<TeamContributionWorkspace> =>
    invoke(
      'team-library:contribution-prepare',
      plainTeamLibraryConfig(config),
      branchSlug,
    ),
  teamContributionList: (): Promise<TeamContributionWorkspace[]> =>
    invoke('team-library:contribution-list'),
  teamContributionOpen: (id: string): Promise<void> =>
    invoke('team-library:contribution-open', id),
  teamContributionDiscard: (id: string): Promise<void> =>
    invoke('team-library:contribution-discard', id),
  teamContributionPublish: (
    id: string,
    title: string,
    body: string,
  ): Promise<TeamContributionPublishResult> =>
    invoke('team-library:contribution-publish', id, title, body),
  teamContributionDiff: (id: string): Promise<TeamContributionDiff> =>
    invoke('team-library:contribution-diff', id),
  teamContributionCatalog: (id: string): Promise<TeamLibraryCatalog> =>
    invoke('team-library:contribution-catalog', id),
  teamContributionGetSkill: (id: string, path: string): Promise<TeamLibrarySkillDraft> =>
    invoke('team-library:contribution-get-skill', id, path),
  teamContributionGetMcp: (id: string, path: string): Promise<TeamLibraryMcpDraft> =>
    invoke('team-library:contribution-get-mcp', id, path),
  teamContributionGetInstruction: (id: string, path: string): Promise<TeamLibraryInstructionDraft> =>
    invoke('team-library:contribution-get-instruction', id, path),
  teamContributionUpsertSkill: (
    id: string,
    input: TeamLibrarySkillDraft,
  ): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-upsert-skill', id, JSON.parse(JSON.stringify(input))),
  teamContributionImportSkill: (
    id: string,
    input: TeamLibrarySkillImportInput,
  ): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-import-skill', id, { ...input }),
  teamContributionUpsertMcp: (
    id: string,
    input: TeamLibraryMcpDraft,
  ): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-upsert-mcp', id, JSON.parse(JSON.stringify(input))),
  teamContributionUpsertInstruction: (
    id: string,
    input: TeamLibraryInstructionDraft,
  ): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-upsert-instruction', id, { ...input }),
  teamContributionUpsertBundle: (
    id: string,
    input: TeamLibraryBundleDraft,
  ): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-upsert-bundle', id, JSON.parse(JSON.stringify(input))),
  teamContributionDelete: (id: string, path: string): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-delete', id, path),
  teamContributionUpdatePolicy: (
    id: string,
    input: TeamLibraryPolicyDraft,
  ): Promise<TeamLibraryMutationResult> =>
    invoke('team-library:contribution-policy', id, JSON.parse(JSON.stringify(input))),
  teamProjectConfig: (projectRoot: string): Promise<TeamProjectConfigResult> =>
    invoke('team-library:project-config', projectRoot),
  teamProjectConfigWrite: (
    projectRoot: string,
    config: TeamProjectConfig,
  ): Promise<TeamProjectConfigResult> =>
    invoke('team-library:project-config-write', projectRoot, JSON.parse(JSON.stringify(config))),
  teamLibrarySync: (config: TeamLibraryConfig): Promise<TeamLibrarySyncResult> =>
    invoke('team-library:sync', plainTeamLibraryConfig(config)),
  teamLibraryGetSkill: (config: TeamLibraryConfig, path: string): Promise<TeamLibrarySkill> =>
    invoke('team-library:get-skill', plainTeamLibraryConfig(config), path),
  teamLibraryGetMcp: (config: TeamLibraryConfig, path: string): Promise<TeamLibraryMcp> =>
    invoke('team-library:get-mcp', plainTeamLibraryConfig(config), path),
  teamLibraryGetInstruction: (config: TeamLibraryConfig, path: string): Promise<TeamLibraryInstruction> =>
    invoke('team-library:get-instruction', plainTeamLibraryConfig(config), path),
  teamLibraryInstallSkill: (
    config: TeamLibraryConfig,
    path: string,
    targets: InstallTarget[],
  ): Promise<TargetResult[]> => invoke(
    'team-library:install-skill',
    plainTeamLibraryConfig(config),
    path,
    targets,
  ),
  teamLibraryInstallations: (): Promise<TeamLibraryInstallRecord[]> =>
    invoke('team-library:installations'),
  teamLibraryRecordMcpInstall: (
    config: TeamLibraryConfig,
    path: string,
    targets: McpTarget[],
  ): Promise<void> => invoke(
    'team-library:record-mcp-install',
    plainTeamLibraryConfig(config),
    path,
    targets,
  ),
  teamLibraryAssertMcpInstall: (
    config: TeamLibraryConfig,
    path: string,
    targets: McpTarget[],
  ): Promise<void> => invoke(
    'team-library:assert-mcp-install',
    plainTeamLibraryConfig(config),
    path,
    targets,
  ),
  pushGitBackup: (request: GitBackupRequest): Promise<GitBackupResult> =>
    invoke('backup:push', request),
  prepareGitRestore: (
    request: Pick<GitBackupRequest, 'remoteUrl' | 'branch'>,
  ): Promise<GitRestorePreview> => invoke('backup:prepare-restore', request),
  restoreGitInstructions: (
    request: GitInstructionRestoreRequest,
  ): Promise<GitInstructionRestoreResult[]> => invoke('backup:restore-instructions', request),
  scanMcpPackages: (request: McpPackageScanRequest): Promise<McpPackageScanResult> =>
    invoke('mcp:packages-scan', request),
  cancelMcpPackageScan: (requestId: string): Promise<void> => invoke('mcp:packages-cancel', requestId),
  onMcpPackageProgress: (callback: (progress: McpPackageProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: McpPackageProgress) => callback(progress)
    ipcRenderer.on('mcp:packages-progress', listener)
    return () => ipcRenderer.removeListener('mcp:packages-progress', listener)
  },
  scanMcpServers: (projectRoots: string[] = []): Promise<McpScanResult> =>
    invoke('mcp:scan', projectRoots),
  createMcpUpsertPlan: (request: McpUpsertPlanRequest): Promise<McpOperationPlanView> =>
    invoke('mcp:plan-upsert', request),
  createMcpRemovePlan: (request: McpRemovePlanRequest): Promise<McpOperationPlanView> =>
    invoke('mcp:plan-remove', request),
  createMcpTogglePlan: (request: McpTogglePlanRequest): Promise<McpOperationPlanView> =>
    invoke('mcp:plan-toggle', request),
  applyMcpPlan: (planId: string): Promise<McpOperationRequestResult> =>
    invoke('mcp:apply-plan', planId),
  setMcpSecret: (request: McpSetSecretRequest): Promise<McpOperationRequestResult> =>
    invoke('mcp:set-secret', request),
  restoreMcpOperation: (
    operationId: string,
  ): Promise<{ path: string; ok: boolean; error?: string }[]> =>
    invoke('mcp:restore', operationId),
  watchMcpStart: (): Promise<number> => invoke('mcp:watch-start'),
  onMcpChanged: (callback: () => void): void => {
    ipcRenderer.on('mcp:changed', () => callback())
  },
  scanSkills: (projectRoots: string[] = []): Promise<AggregatedSkill[]> =>
    invoke('skills:scan', projectRoots),
  scanSkillsDiagnostics: (
    projectRoots: string[] = [],
  ): Promise<{ skills: AggregatedSkill[]; warnings: SkillParseWarning[] }> =>
    invoke('skills:scan-diagnostics', projectRoots),
  scanInstructions: (request: InstructionScanRequest): Promise<InstructionServiceScan> =>
    invoke('instructions:scan', request),
  scanProjectInstructions: (request: InstructionScanRequest): Promise<InstructionServiceScan> =>
    invoke('instructions:scan-projects', request),
  listInstructionProfiles: (): Promise<InstructionRuleProfile[]> =>
    invoke('instructions:profiles'),
  effectiveInstructionChain: (request: InstructionEffectiveChainRequest): Promise<EffectiveInstructionChain> =>
    invoke('instructions:effective-chain', request),
  readInstruction: (request: InstructionReadRequest): Promise<InstructionReadResult> =>
    invoke('instructions:read', request),
  createInstructionWritePlan: (request: InstructionWritePlanRequest): Promise<InstructionOperationPlanView> =>
    invoke('instructions:plan-write', request),
  createInstructionDeletePlan: (request: InstructionDeletePlanRequest): Promise<InstructionOperationPlanView> =>
    invoke('instructions:plan-delete', request),
  createInstructionBridgePlan: (request: InstructionBridgePlanRequest): Promise<InstructionOperationPlanView> =>
    invoke('instructions:plan-bridge', request),
  applyInstructionPlan: (planId: string): Promise<InstructionOperationResult> =>
    invoke('instructions:apply-plan', planId),
  applyInstructionBridgePlan: (planId: string): Promise<InstructionOperationResult> =>
    invoke('instructions:apply-bridge', planId),
  restoreInstructionOperation: (
    operationId: string,
  ): Promise<{ path: string; ok: boolean; error?: string }[]> =>
    invoke('instructions:restore', operationId),
  watchInstructionsStart: (projectRoots: string[]): Promise<number> =>
    invoke('instructions:watch-start', projectRoots),
  onInstructionsChanged: (callback: () => void): void => {
    ipcRenderer.on('instructions:changed', callback)
  },
  listPlatforms: (): Promise<PlatformStatus[]> => invoke('platforms:list'),
  registerPlatforms: (defs: CustomPlatformInput[]): Promise<void> =>
    invoke('platforms:register', defs),
  cleanupPlatformResidue: (
    platformId: string,
    paths: string[],
  ): Promise<PlatformCleanupResult[]> =>
    invoke('platforms:cleanup-residue', platformId, paths),
  discoverPlatforms: (): Promise<PlatformDraft[]> => invoke('platforms:discover'),
  pickPlatformDirectory: (): Promise<PlatformDraft | null> =>
    invoke('platforms:pick-directory'),
  installSkill: (skill: Skill, targets: InstallTarget[]): Promise<TargetResult[]> =>
    invoke('skills:install', skill, targets),
  uninstallSkill: (name: string, targets: InstallTarget[]): Promise<TargetResult[]> =>
    invoke('skills:uninstall', name, targets),
  setSkillEnabled: (
    name: string,
    targets: InstallTarget[],
    enabled: boolean,
  ): Promise<TargetResult[]> => invoke('skills:set-enabled', name, targets, enabled),
  revealInFolder: (path: string): Promise<void> => invoke('skills:reveal', path),
  pickDirectory: (): Promise<string | null> => invoke('dialog:pick-directory'),
  pickSkillFiles: (): Promise<string[]> => invoke('dialog:pick-skill-files'),
  findSkillsInDir: (root: string): Promise<{
    items: FoundSkill[]
    warnings: SkillParseWarning[]
  }> =>
    invoke('skills:find-in-dir', root),
  findSkillsInPaths: (paths: string[]): Promise<{
    items: FoundSkill[]
    warnings: SkillParseWarning[]
  }> => invoke('skills:find-in-paths', paths),
  findDroppedSkills: (files: File[]): Promise<{
    items: FoundSkill[]
    warnings: SkillParseWarning[]
  }> => invoke(
    'skills:find-dropped',
    files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  ),
  importFromGit: (url: string): Promise<{
    root: string
    items: FoundSkill[]
    warnings: SkillParseWarning[]
  }> =>
    invoke('skills:import-git', url),
  cleanupImport: (root: string): Promise<void> =>
    invoke('skills:cleanup-import', root),
  aiConversationAgents: (): Promise<string[]> => invoke('ai:conversation-agents'),
  aiConversationCreate: (
    agentId: string,
    context: AiConversationContext,
  ): Promise<{ conversationId: string }> =>
    invoke('ai:conversation-create', agentId, context),
  aiConversationSend: (conversationId: string, message: string): Promise<void> =>
    invoke('ai:conversation-send', conversationId, message),
  aiConversationCancel: (conversationId: string): Promise<boolean> =>
    invoke('ai:conversation-cancel', conversationId),
  aiConversationDispose: (conversationId: string): Promise<void> =>
    invoke('ai:conversation-dispose', conversationId),
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
    invoke('market:search', q),
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
  }> => invoke('market:github-search', q, page),
  openExternal: (url: string): Promise<void> => invoke('shell:open-external', url),
  /** 按用户「打开链接方式」设置分流（默认浏览器 / 应用内浏览器）。 */
  openLink: (url: string): Promise<void> => invoke('links:open', url),
  setLinkOpenMode: (mode: LinkOpenMode): Promise<void> =>
    invoke('links:set-mode', mode),
  browserClose: (): Promise<void> => invoke('browser:close'),
  browserBack: (): Promise<void> => invoke('browser:back'),
  browserForward: (): Promise<void> => invoke('browser:forward'),
  browserReload: (): Promise<void> => invoke('browser:reload'),
  browserState: (): Promise<InAppBrowserState> => invoke('browser:state'),
  onBrowserState: (callback: (state: InAppBrowserState) => void): void => {
    ipcRenderer.on('browser:state', (_event, state: InAppBrowserState) => callback(state))
  },
  setTheme: (mode: 'system' | 'light' | 'dark'): Promise<void> =>
    invoke('theme:set', mode),
  setWindowChromeTheme: (colors: { background: string; foreground: string }): Promise<void> =>
    invoke('window:set-theme', colors),
  setWindowVibrancy: (enabled: boolean): Promise<void> => invoke('window:set-vibrancy', enabled),
  getAppInfo: (): Promise<AppInfo> => invoke('app:info'),
  checkUpdate: (): Promise<UpdateCheckResult> => invoke('app:check-update'),
  downloadUpdate: (latest: string): Promise<UpdateDownloadResult> =>
    invoke('app:download-update', latest),
  onUpdateDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void): void => {
    ipcRenderer.on('app:update-progress', (_event, progress: UpdateDownloadProgress) => callback(progress))
  },
  getLoginItem: (): Promise<boolean> => invoke('system:get-login-item'),
  setLoginItem: (openAtLogin: boolean): Promise<void> =>
    invoke('system:set-login-item', openAtLogin),
  getDesktopPreferences: (): Promise<DesktopPreferences> =>
    invoke('system:get-desktop-preferences'),
  setDesktopPreferences: (
    preferences: DesktopPreferences,
  ): Promise<DesktopPreferences> =>
    invoke('system:set-desktop-preferences', preferences),
  /** 注册全局唤起快捷键，返回是否注册成功（空串表示清除）。 */
  setGlobalShortcut: (accelerator: string): Promise<boolean> =>
    invoke('system:set-global-shortcut', accelerator),
  setProxy: (url: string): Promise<void> => invoke('network:set-proxy', url),
  exportConfig: (content: string): Promise<boolean> =>
    invoke('config:export', content),
  importConfig: (): Promise<string | null> => invoke('config:import'),
  confirmDialog: (options: ConfirmOptions): Promise<boolean> =>
    invoke('dialog:confirm', options),
  openUserData: (): Promise<void> => invoke('system:open-user-data'),
  fetchBundlesManifest: (url: string): Promise<unknown> =>
    invoke('bundles:manifest', url),
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
  }> => invoke('market:skillhub-search', q, page),
  githubStars: (repos: string[]): Promise<Record<string, number>> =>
    invoke('market:github-stars', repos),
  modelscopeMcpSearch: (
    q: string,
    page = 1,
    category = '',
  ): Promise<{
    items: ModelScopeMcpSummary[]
    total: number
    categories: ModelScopeMcpCategory[]
  }> => invoke('mcp-market:modelscope-search', q, page, category),
  modelscopeMcpStats: (ids: string[]): Promise<ModelScopeMcpStats[]> =>
    invoke('mcp-market:modelscope-stats', ids),
  modelscopeMcpDetail: (id: string): Promise<ModelScopeMcpDetail> =>
    invoke('mcp-market:modelscope-detail', id),
  mcpsoSearch: (q: string, category = ''): Promise<{ items: McpSoCard[] }> =>
    invoke('mcp-market:mcpso-search', q, category),
  mcpsoDetail: (slug: string): Promise<McpSoDetail> =>
    invoke('mcp-market:mcpso-detail', slug),
  validateMcpMarketDefinitions: (
    definitions: McpServerDefinition[],
  ): Promise<McpMarketValidationResult[]> =>
    invoke('mcp-market:validate-definitions', definitions),
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
  > => invoke('market:skillhub-versions', slug, namespace),
  skillhubFetch: (
    slug: string,
    namespace: string,
  ): Promise<{ root: string; items: FoundSkill[]; warnings: SkillParseWarning[] }> =>
    invoke('market:skillhub-fetch', slug, namespace),
  watchStart: (projectRoots: string[]): Promise<number> =>
    invoke('watch:start', projectRoots),
  secureGet: (key: string): Promise<string> => invoke('secure:get', key),
  secureSet: (key: string, value: string): Promise<void> =>
    invoke('secure:set', key, value),
  trashUndoable: (
    paths: string[],
  ): Promise<{ token: string; results: { path: string; ok: boolean; error?: string }[] }> =>
    invoke('skills:trash-undoable', paths),
  undoTrash: (token: string): Promise<boolean> => invoke('skills:undo-trash', token),
  trashPaths: (paths: string[]): Promise<{ path: string; ok: boolean; error?: string }[]> =>
    invoke('skills:trash', paths),
  readFile: (path: string): Promise<{ content: string; truncated: boolean }> =>
    invoke('file:read', path),
  previewFile: (path: string): Promise<FilePreviewResult> =>
    invoke('file:preview', path),
  listTree: (root: string): Promise<{ path: string; size: number; isDir: boolean }[]> =>
    invoke('file:list-tree', root),
  onSkillsChanged: (callback: (changedAt: number) => void): void => {
    ipcRenderer.on('skills:changed', (_event, changedAt: unknown) => {
      callback(typeof changedAt === 'number' ? changedAt : Date.now())
    })
  },
  updateTrayStatus: (status: TrayStatus): Promise<void> =>
    invoke('tray:update-status', status),
  onTrayCommand: (callback: (command: TrayCommand) => void): void => {
    ipcRenderer.on('tray:command', (_event, command: TrayCommand) => callback(command))
  },
  removeTrayCommandListeners: (): void => {
    ipcRenderer.removeAllListeners('tray:command')
  },
}

export type SkillsManagerApi = typeof api

contextBridge.exposeInMainWorld('skillsManager', api)
