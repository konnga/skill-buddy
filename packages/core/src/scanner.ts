import { allAdapters } from './adapters/index.js'
import type { AgentId, InstalledSkill } from './types.js'

export interface PlatformStatus {
  id: AgentId
  displayName: string
  detected: boolean
  hasProjectScope: boolean
}

/** Detection status of every registered platform, for pickers and sidebars. */
export async function listPlatformStatus(): Promise<PlatformStatus[]> {
  return Promise.all(
    allAdapters().map(async (adapter) => ({
      id: adapter.agent,
      displayName: adapter.displayName,
      detected: await adapter.detect(),
      hasProjectScope: adapter.skillsDir('project', '/probe') !== null,
    })),
  )
}

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
