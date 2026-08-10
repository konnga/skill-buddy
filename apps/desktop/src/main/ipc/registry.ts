import { ipcMain } from 'electron'
import { RegistryClient, toSkill, type Skill } from '@skillbuddy/core'
import type { InstallTarget, RegistryConfig } from '../../shared/ipc.js'
import type { PathAccessPolicy } from '../path-policy.js'
import { installTarget, runTargets } from './targets.js'

const clientOf = (config: RegistryConfig): RegistryClient =>
  new RegistryClient(config.url, config.token)

/** 注册团队 Registry 相关 IPC。 */
export function registerRegistryIpc(pathPolicy: PathAccessPolicy): void {
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
