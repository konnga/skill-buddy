import { contextBridge, ipcRenderer } from 'electron'
import type { InstalledSkill } from '@skills-manager/core'

const api = {
  scanSkills: (projectRoot?: string): Promise<InstalledSkill[]> =>
    ipcRenderer.invoke('skills:scan', projectRoot),
}

export type SkillsManagerApi = typeof api

contextBridge.exposeInMainWorld('skillsManager', api)
