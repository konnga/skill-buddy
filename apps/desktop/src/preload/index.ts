import { contextBridge, ipcRenderer } from 'electron'
import type { AggregatedSkill, FoundSkill, PlatformStatus, Skill } from '@skills-manager/core'
import type { CustomPlatformInput, InstallTarget, TargetResult } from '../shared/ipc.js'

const api = {
  scanSkills: (projectRoots: string[] = []): Promise<AggregatedSkill[]> =>
    ipcRenderer.invoke('skills:scan', projectRoots),
  listPlatforms: (): Promise<PlatformStatus[]> => ipcRenderer.invoke('platforms:list'),
  registerPlatforms: (defs: CustomPlatformInput[]): Promise<void> =>
    ipcRenderer.invoke('platforms:register', defs),
  installSkill: (skill: Skill, targets: InstallTarget[]): Promise<TargetResult[]> =>
    ipcRenderer.invoke('skills:install', skill, targets),
  uninstallSkill: (name: string, targets: InstallTarget[]): Promise<TargetResult[]> =>
    ipcRenderer.invoke('skills:uninstall', name, targets),
  revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('skills:reveal', path),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-directory'),
  findSkillsInDir: (root: string): Promise<FoundSkill[]> =>
    ipcRenderer.invoke('skills:find-in-dir', root),
  importFromGit: (url: string): Promise<{ root: string; items: FoundSkill[] }> =>
    ipcRenderer.invoke('skills:import-git', url),
  cleanupImport: (root: string): Promise<void> =>
    ipcRenderer.invoke('skills:cleanup-import', root),
}

export type SkillsManagerApi = typeof api

contextBridge.exposeInMainWorld('skillsManager', api)
