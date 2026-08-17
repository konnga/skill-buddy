import { computed } from 'vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { useSkills } from './useSkills.js'
import { useTeamLibraries } from './useTeamLibraries.js'
import { useTeamProjects } from './useTeamProjects.js'

/** 汇总首页、需要处理页和托盘共用的待处理数量。 */
export function useAttentionSummary() {
  const { skills, detectedPlatforms } = useSkills()
  const { compliance } = useTeamLibraries()
  const { attentionCount: projectAttentionCount } = useTeamProjects()

  const driftSkills = computed(() =>
    skills.value.filter(
      (skill) => skill.hasDrift && skill.installations.some((installation) => !installation.readOnly),
    ),
  )

  const singleEndSkills = computed(() =>
    skills.value.filter((skill: AggregatedSkill) => {
      const agents = new Set(skill.installations.map((installation) => installation.agent))
      return agents.size === 1 && detectedPlatforms.value.length > 1
    }),
  )

  const count = computed(
    () =>
      driftSkills.value.length +
      singleEndSkills.value.length +
      compliance.value.missingRequired.length +
      compliance.value.blockedInstalled.length +
      compliance.value.updateAvailable +
      projectAttentionCount.value,
  )

  return { count, driftSkills, singleEndSkills }
}
