import { allAdapters } from './adapters/index.js'
import type { InstalledSkill } from './types.js'

/**
 * Scan every detected agent platform and return all locally installed skills.
 * Pass a projectRoot to also include project-scoped skills.
 */
export async function scanInstalledSkills(projectRoot?: string): Promise<InstalledSkill[]> {
  const results: InstalledSkill[] = []
  for (const adapter of allAdapters()) {
    if (!(await adapter.detect())) continue
    results.push(...(await adapter.list('user')))
    if (projectRoot) results.push(...(await adapter.list('project', projectRoot)))
  }
  return results
}
