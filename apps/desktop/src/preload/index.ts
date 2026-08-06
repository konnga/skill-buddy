import { contextBridge, ipcRenderer } from 'electron'
import type { AggregatedSkill, PlatformStatus, Skill } from '@skills-manager/core'
import type { InstallTarget, TargetResult } from '../shared/ipc.js'

const api = {
  scanSkills: (): Promise<AggregatedSkill[]> => ipcRenderer.invoke('skills:scan'),
  listPlatforms: (): Promise<PlatformStatus[]> => ipcRenderer.invoke('platforms:list'),
  installSkill: (skill: Skill, targets: InstallTarget[]): Promise<TargetResult[]> =>
    ipcRenderer.invoke('skills:install', skill, targets),
  uninstallSkill: (name: string, targets: InstallTarget[]): Promise<TargetResult[]> =>
    ipcRenderer.invoke('skills:uninstall', name, targets),
  revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('skills:reveal', path),
}

export type SkillsManagerApi = typeof api

contextBridge.exposeInMainWorld('skillsManager', api)
