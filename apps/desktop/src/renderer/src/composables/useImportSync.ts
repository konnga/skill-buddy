import { planImportSync } from '@skillbuddy/core/planners'
import { useSettings } from './useSettings.js'
import { useSkills } from './useSkills.js'

let running = false

/**
 * Standing import connections: install skills that appeared on a source
 * and were never handled before (plan computed by core's planImportSync
 * — additive, once per skill, never overwrites or re-forces deletions).
 */
export async function runImportSync(): Promise<void> {
  if (running) return
  const { importSyncPairs } = useSettings()
  const { skills, installSkill, refresh } = useSkills()
  if (importSyncPairs.value.length === 0) return
  running = true
  let refreshNeeded = false
  const completedByPair = new Map<number, string[]>()
  try {
    const actions = planImportSync(importSyncPairs.value, skills.value)
    for (const action of actions) {
      const pair = importSyncPairs.value[action.pairIndex]!
      if (action.install) {
        const source = skills.value
          .find((s) => s.name === action.name)!
          .installations.find((i) => i.agent === pair.source && i.scope === 'user')!
        await installSkill(
          source.skill,
          [
            {
              agent: pair.target,
              scope: pair.scope as 'user' | 'project',
              projectRoot: pair.projectRoot,
            },
          ],
          { refresh: false },
        )
        refreshNeeded = true
      }
      const completed = completedByPair.get(action.pairIndex) ?? []
      if (!completed.includes(action.name)) completed.push(action.name)
      completedByPair.set(action.pairIndex, completed)
    }
  } finally {
    try {
      if (completedByPair.size > 0) {
        importSyncPairs.value = importSyncPairs.value.map((pair, index) => {
          const completed = completedByPair.get(index)
          if (!completed || completed.length === 0) return pair
          return {
            ...pair,
            synced: [...new Set([...pair.synced, ...completed])],
          }
        })
      }
      if (refreshNeeded) await refresh({ silent: true })
    } finally {
      running = false
    }
  }
}
