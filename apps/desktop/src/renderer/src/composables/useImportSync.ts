import { useSettings } from './useSettings.js'
import { useSkills } from './useSkills.js'

let running = false

/**
 * Standing import connections: for every source→target pair, install
 * skills that appeared on the source and were never handled before.
 * Strictly additive and once-per-skill — user deletions on the target
 * are never re-forced, existing installs never overwritten.
 */
export async function runImportSync(): Promise<void> {
  if (running) return
  const { importSyncPairs } = useSettings()
  const { skills, installSkill } = useSkills()
  if (importSyncPairs.value.length === 0) return
  running = true
  try {
    for (const pair of importSyncPairs.value) {
      const fresh = skills.value.filter(
        (s) =>
          s.installations.some((i) => i.agent === pair.source && i.scope === 'user') &&
          !pair.synced.includes(s.name),
      )
      if (fresh.length === 0) continue
      for (const s of fresh) {
        const alreadyThere = s.installations.some(
          (i) =>
            i.agent === pair.target &&
            i.scope === pair.scope &&
            (i.projectRoot ?? '') === (pair.projectRoot ?? ''),
        )
        if (!alreadyThere) {
          const source = s.installations.find(
            (i) => i.agent === pair.source && i.scope === 'user',
          )!
          await installSkill(source.skill, [
            {
              agent: pair.target,
              scope: pair.scope as 'user' | 'project',
              projectRoot: pair.projectRoot,
            },
          ])
        }
        pair.synced.push(s.name)
      }
    }
  } finally {
    running = false
  }
}
