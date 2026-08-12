import type { AggregatedSkill } from '@skillbuddy/core'
import {
  manageableSkillInstallations,
  matchesSkillInstallation,
  type SkillInstallationFilter,
} from './skill-installations.js'

export type GroupRuntimeStatus = 'empty' | 'enabled' | 'disabled' | 'partial' | 'unavailable'

export interface GroupRuntimeState {
  name: string
  status: GroupRuntimeStatus
  totalSkills: number
  installedSkills: number
  enabledInstallations: number
  disabledInstallations: number
  manageableInstallations: number
  missingSkills: string[]
}

interface SkillGroupRef {
  name: string
  skills: string[]
}

/** 从 Agent 目录实时推导合集状态，不创建额外的持久化激活状态。 */
export function deriveGroupRuntimeState(
  group: SkillGroupRef,
  skills: AggregatedSkill[],
  filter: SkillInstallationFilter,
): GroupRuntimeState {
  const localByName = new Map(skills.map((skill) => [skill.name, skill]))
  let installedSkills = 0
  let enabledInstallations = 0
  let disabledInstallations = 0
  let manageableInstallations = 0
  const missingSkills: string[] = []

  for (const name of group.skills) {
    const skill = localByName.get(name)
    const visible =
      skill?.installations.filter((installation) =>
        matchesSkillInstallation(installation, filter),
      ) ?? []
    if (visible.length === 0) missingSkills.push(name)
    else installedSkills += 1

    if (!skill) continue
    const manageable = manageableSkillInstallations(skill, filter)
    manageableInstallations += manageable.length
    enabledInstallations += manageable.filter(
      (installation) => installation.enabled !== false,
    ).length
    disabledInstallations += manageable.filter(
      (installation) => installation.enabled === false,
    ).length
  }

  let status: GroupRuntimeStatus
  if (group.skills.length === 0) status = 'empty'
  else if (manageableInstallations === 0) status = 'unavailable'
  else if (missingSkills.length === 0 && disabledInstallations === 0) status = 'enabled'
  else if (missingSkills.length === 0 && enabledInstallations === 0) status = 'disabled'
  else status = 'partial'

  return {
    name: group.name,
    status,
    totalSkills: group.skills.length,
    installedSkills,
    enabledInstallations,
    disabledInstallations,
    manageableInstallations,
    missingSkills,
  }
}
