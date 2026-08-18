import type { AggregatedSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import type { SkillInstallation } from '@/lib/skill-installations'

export type BatchAction = 'enable' | 'disable' | 'uninstall'
export type ToggleContext = 'agent' | 'scope' | 'scopeAgent' | 'global'

/** 批量确认时冻结的目标快照，避免用户确认后筛选变化影响执行范围。 */
export interface BatchItem {
  name: string
  targets: InstallTarget[]
  paths: string[]
}

export interface BatchRequest {
  action: BatchAction
  items: BatchItem[]
}

export interface UninstallRequest {
  skill: AggregatedSkill
  platformId: string | null
  projectFilter: string | null
  installations: SkillInstallation[]
}

export interface ToggleRequest {
  skill: AggregatedSkill
  platformId: string | null
  enabled: boolean
  context: ToggleContext
  installations: SkillInstallation[]
}
