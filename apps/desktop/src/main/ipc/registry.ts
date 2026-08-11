import { ipcMain } from 'electron'
import { RegistryClient, toSkill, type McpServerDefinition, type Skill } from '@skillbuddy/core'
import type { InstallTarget, RegistryConfig, RegistryTestResult } from '../../shared/ipc.js'
import type { PathAccessPolicy } from '../path-policy.js'
import { installTarget, runTargets } from './targets.js'

const clientOf = (config: RegistryConfig): RegistryClient =>
  new RegistryClient(config.url, config.token)

/** 注册团队 Registry 相关 IPC。 */
export function registerRegistryIpc(pathPolicy: PathAccessPolicy): void {
  ipcMain.handle(
    'registry:test',
    async (_event, config: RegistryConfig): Promise<RegistryTestResult> => {
      const start = Date.now()
      try {
        await clientOf(config).health()
      } catch (error) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          authOk: false,
          orgs: [],
          error: error instanceof Error ? error.message : String(error),
        }
      }
      const latencyMs = Date.now() - start
      try {
        const orgs = await clientOf(config).listOrgs()
        return { ok: true, latencyMs, authOk: true, orgs: orgs.map((org) => org.name) }
      } catch (error) {
        return {
          ok: true,
          latencyMs,
          authOk: false,
          orgs: [],
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )

  ipcMain.handle('registry:search', (_event, config: RegistryConfig, query?: string) =>
    clientOf(config).search(query),
  )

  ipcMain.handle('registry:orgs', (_event, config: RegistryConfig) =>
    clientOf(config).listOrgs(),
  )

  ipcMain.handle(
    'registry:install',
    async (
      _event,
      config: RegistryConfig,
      org: string,
      name: string,
      targets: InstallTarget[],
    ) => {
      const remote = await clientOf(config).getSkill(org, name)
      const skill = await toSkill(remote)
      return runTargets(targets, (target) => installTarget(skill, target, pathPolicy))
    },
  )

  ipcMain.handle('registry:required', (_event, config: RegistryConfig, org: string) =>
    clientOf(config).requiredSkills(org),
  )

  ipcMain.handle(
    'registry:get',
    (_event, config: RegistryConfig, org: string, name: string) =>
      clientOf(config).getSkill(org, name),
  )

  ipcMain.handle(
    'registry:versions',
    (_event, config: RegistryConfig, org: string, name: string) =>
      clientOf(config).listVersions(org, name),
  )

  ipcMain.handle('registry:mcp-search', (_event, config: RegistryConfig, query?: string) =>
    clientOf(config).searchMcpServers(query),
  )

  ipcMain.handle(
    'registry:mcp-get',
    (_event, config: RegistryConfig, org: string, name: string, version?: string) =>
      clientOf(config).getMcpServer(org, name, version),
  )

  ipcMain.handle(
    'registry:mcp-versions',
    (_event, config: RegistryConfig, org: string, name: string) =>
      clientOf(config).listMcpVersions(org, name),
  )

  ipcMain.handle(
    'registry:mcp-publish',
    (
      _event,
      config: RegistryConfig,
      org: string,
      definition: McpServerDefinition,
      version: string,
      description?: string,
    ) => clientOf(config).publishMcpServer(org, definition, version, description),
  )

  ipcMain.handle('registry:required-mcp', (_event, config: RegistryConfig, org: string) =>
    clientOf(config).requiredMcpServers(org),
  )

  ipcMain.handle(
    'registry:set-required-mcp',
    (_event, config: RegistryConfig, org: string, names: string[]) =>
      clientOf(config).setRequiredMcpServers(org, names),
  )

  ipcMain.handle('registry:bundles', (_event, config: RegistryConfig) =>
    clientOf(config).listBundles(),
  )

  ipcMain.handle(
    'registry:bundle-get',
    (_event, config: RegistryConfig, org: string, name: string, version?: string) =>
      clientOf(config).getBundle(org, name, version),
  )

  ipcMain.handle(
    'registry:publish',
    async (
      _event,
      config: RegistryConfig,
      org: string,
      skill: Skill,
      version: string,
    ) => {
      await pathPolicy.assertSkillResources(skill)
      await clientOf(config).publish(org, skill, version)
    },
  )
}
