import { computed } from 'vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { useAttentionCounters } from './useAttentionCounters.js'
import { useSkills } from './useSkills.js'

/** 汇总首页、需要处理页和托盘共用的待处理数量。 */
export function useAttentionSummary() {
  const { skills, detectedPlatforms } = useSkills()
  const { teamLibraryCount, teamProjectCount } = useAttentionCounters()

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
      teamLibraryCount.value +
      teamProjectCount.value,
  )

  return { count, driftSkills, singleEndSkills }
}
