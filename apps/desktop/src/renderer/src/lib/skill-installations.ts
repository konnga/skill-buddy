import type { AggregatedSkill } from '@skillbuddy/core'

export type SkillInstallation = AggregatedSkill['installations'][number]

export interface SkillInstallationFilter {
  platformId?: string | null
  /** null = all; "user" = user scope; any other value = project root. */
  projectFilter?: string | null
  ownershipFilter?: 'managed' | 'agent' | null
}

/** Match one installation against the current Agent, scope and ownership view. */
export function matchesSkillInstallation(
  installation: SkillInstallation,
  filter: SkillInstallationFilter,
): boolean {
  if (filter.platformId && installation.agent !== filter.platformId) return false
  if (filter.projectFilter === 'user' && installation.scope !== 'user') return false
  if (
    filter.projectFilter &&
    filter.projectFilter !== 'user' &&
    installation.projectRoot !== filter.projectFilter
  )
    return false
  if (filter.ownershipFilter === 'managed' && installation.readOnly) return false
  if (filter.ownershipFilter === 'agent' && !installation.readOnly) return false
  return true
}

/** Return writable installations in the current view, deduplicated by physical path. */
export function manageableSkillInstallations(
  skill: AggregatedSkill,
  filter: SkillInstallationFilter,
): SkillInstallation[] {
  const paths = new Set<string>()
  return skill.installations.filter((installation) => {
    if (
      installation.readOnly ||
      !matchesSkillInstallation(installation, filter) ||
      paths.has(installation.path)
    )
      return false
    paths.add(installation.path)
    return true
  })
}
