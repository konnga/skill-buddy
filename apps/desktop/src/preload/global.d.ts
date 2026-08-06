import type { SkillsManagerApi } from './index.js'

declare global {
  interface Window {
    skillsManager: SkillsManagerApi
  }
}

export {}
