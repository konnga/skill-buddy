import { ipcMain } from 'electron'
import type {
  InstallTarget,
  TeamLibraryConfig,
  TeamLibraryBundleDraft,
  TeamLibraryInitializeInput,
  TeamLibraryMcpDraft,
  TeamLibraryPolicyDraft,
  TeamLibraryProbeInput,
  TeamLibrarySkillDraft,
  TeamLibrarySkillImportInput,
  TeamProjectConfig,
} from '../../shared/ipc.js'
import type { PathAccessPolicy } from '../path-policy.js'
import {
  getTeamLibraryMcp,
  getTeamLibrarySkill,
  assertTeamLibraryMcpInstallAllowed,
  listTeamSkillInstallations,
  initializeTeamLibrary,
  materializeTeamSkill,
  probeTeamLibrary,
  recordTeamMcpInstall,
  recordTeamSkillInstall,
  syncTeamLibrary,
  teamLibraryRepositoryRoot,
} from '../team-library.js'
import { installTarget, runTargets } from './targets.js'
import { readTeamProjectConfig, writeTeamProjectConfig } from '../team-project.js'
import {
  discardTeamContribution,
  openTeamContribution,
  prepareTeamContribution,
  publishTeamContribution,
} from '../team-contribution.js'
import {
  deleteTeamResource,
  getTeamContributionMcp,
  getTeamContributionSkill,
  importTeamSkill,
  teamContributionCatalog,
  teamContributionDiffWithValidation,
  updateTeamOrganizationPolicy,
  upsertTeamBundle,
  upsertTeamMcp,
  upsertTeamSkill,
  validateTeamLibraryWorkspace,
} from '../team-library-management.js'

/** 注册 Git 团队库同步、读取和安装 IPC。 */
export function registerTeamLibraryIpc(pathPolicy: PathAccessPolicy): void {
  ipcMain.handle(
    'team-library:probe',
    (_event, input: TeamLibraryProbeInput) => probeTeamLibrary(input),
  )
  ipcMain.handle(
    'team-library:initialize',
    (_event, input: TeamLibraryInitializeInput) => initializeTeamLibrary(input),
  )
  ipcMain.handle(
    'team-library:contribution-prepare',
    (_event, config: TeamLibraryConfig, branchSlug: string) =>
      prepareTeamContribution(config, branchSlug),
  )
  ipcMain.handle('team-library:contribution-open', (_event, id: string) => openTeamContribution(id))
  ipcMain.handle('team-library:contribution-discard', (_event, id: string) => discardTeamContribution(id))
  ipcMain.handle(
    'team-library:contribution-publish',
    async (_event, id: string, title: string, body: string) => {
      const issues = await validateTeamLibraryWorkspace(id)
      if (issues.length > 0) {
        throw new Error(`团队库校验失败：${issues.map((item) => `${item.path}: ${item.message}`).join('；')}`)
      }
      return publishTeamContribution(id, title, body)
    },
  )
  ipcMain.handle('team-library:contribution-diff', (_event, id: string) =>
    teamContributionDiffWithValidation(id))
  ipcMain.handle('team-library:contribution-catalog', (_event, id: string) =>
    teamContributionCatalog(id))
  ipcMain.handle('team-library:contribution-get-skill', (_event, id: string, path: string) =>
    getTeamContributionSkill(id, path))
  ipcMain.handle('team-library:contribution-get-mcp', (_event, id: string, path: string) =>
    getTeamContributionMcp(id, path))
  ipcMain.handle(
    'team-library:contribution-upsert-skill',
    (_event, id: string, input: TeamLibrarySkillDraft) => upsertTeamSkill(id, input),
  )
  ipcMain.handle(
    'team-library:contribution-import-skill',
    async (_event, id: string, input: TeamLibrarySkillImportInput) => {
      await pathPolicy.assertReadable(input.sourcePath)
      return importTeamSkill(id, input)
    },
  )
  ipcMain.handle(
    'team-library:contribution-upsert-mcp',
    (_event, id: string, input: TeamLibraryMcpDraft) => upsertTeamMcp(id, input),
  )
  ipcMain.handle(
    'team-library:contribution-upsert-bundle',
    (_event, id: string, input: TeamLibraryBundleDraft) => upsertTeamBundle(id, input),
  )
  ipcMain.handle(
    'team-library:contribution-delete',
    (_event, id: string, path: string) => deleteTeamResource(id, path),
  )
  ipcMain.handle(
    'team-library:contribution-policy',
    (_event, id: string, input: TeamLibraryPolicyDraft) => updateTeamOrganizationPolicy(id, input),
  )
  ipcMain.handle('team-library:project-config', (_event, projectRoot: string) =>
    readTeamProjectConfig(projectRoot),
  )
  ipcMain.handle(
    'team-library:project-config-write',
    (_event, projectRoot: string, config: TeamProjectConfig) =>
      writeTeamProjectConfig(projectRoot, config),
  )
  ipcMain.handle('team-library:sync', (_event, config: TeamLibraryConfig) => syncTeamLibrary(config))
  ipcMain.handle('team-library:get-skill', (_event, config: TeamLibraryConfig, path: string) =>
    getTeamLibrarySkill(config, path),
  )
  ipcMain.handle('team-library:get-mcp', (_event, config: TeamLibraryConfig, path: string) =>
    getTeamLibraryMcp(config, path),
  )
  ipcMain.handle('team-library:installations', () => listTeamSkillInstallations())
  ipcMain.handle(
    'team-library:assert-mcp-install',
    (_event, config: TeamLibraryConfig, path: string, targets: import('@skillbuddy/core').McpTarget[]) =>
      assertTeamLibraryMcpInstallAllowed(config, path, targets),
  )
  ipcMain.handle(
    'team-library:record-mcp-install',
    async (_event, config: TeamLibraryConfig, path: string, targets: import('@skillbuddy/core').McpTarget[]) => {
      await assertTeamLibraryMcpInstallAllowed(config, path, targets)
      const source = await getTeamLibraryMcp(config, path)
      await recordTeamMcpInstall(source, targets)
    },
  )
  ipcMain.handle(
    'team-library:install-skill',
    async (_event, config: TeamLibraryConfig, path: string, targets: InstallTarget[]) => {
      const { skill, source } = await materializeTeamSkill(config, path, targets)
      pathPolicy.grantSelectedRoot(teamLibraryRepositoryRoot(config))
      await pathPolicy.assertSkillResources(skill)
      const results = await runTargets(targets, (target) => installTarget(skill, target, pathPolicy))
      await recordTeamSkillInstall(
        source,
        skill,
        results.filter((result) => result.ok).map((result) => result.target),
      )
      return results
    },
  )
}
