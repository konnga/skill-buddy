import { computed, readonly, ref, shallowRef, watch, type DeepReadonly } from 'vue'
import type {
  TeamLibraryBundleSummary,
  TeamLibraryCatalog,
  TeamLibraryInstallRecord,
  TeamLibraryMcpSummary,
  TeamLibrarySkillSummary,
  TeamLibraryPolicy,
  TeamProjectConfig,
  TeamProjectConfigResult,
} from '../../../shared/ipc.js'
import { blockedTeamAssetReason, emptyTeamPolicy, mergeTeamPolicies } from '../../../shared/team-policy.js'
import { useSettings } from './useSettings.js'
import { useTeamLibraries } from './useTeamLibraries.js'

export type TeamProjectRequirementType = 'bundle' | 'skill' | 'mcp'
export type TeamProjectRequirementState = 'satisfied' | 'missing' | 'outdated' | 'unresolved' | 'blocked'

export interface TeamProjectRequirementStatus {
  type: TeamProjectRequirementType
  ref: string
  label: string
  state: TeamProjectRequirementState
  reason?: 'unresolved-ref' | 'bundle-missing-members' | 'bundle-incomplete' | 'blocked-policy'
  detail?: number
  policyReason?: string
}

export interface TeamProjectCompliance {
  projectRoot: string
  configPath: string
  found: boolean
  config?: TeamProjectConfig
  error?: string
  requirements: TeamProjectRequirementStatus[]
  satisfied: number
  missing: number
  outdated: number
  unresolved: number
  blocked: number
}

const projectConfigs = ref<TeamProjectConfigResult[]>([])
const loading = shallowRef(false)
let initialized = false

function normalizedPath(value: string | undefined): string {
  if (!value) return ''
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[A-Za-z]:/.test(normalized) ? normalized.toLowerCase() : normalized
}

function splitRef(ref: string, fallbackLibrary?: string): { libraryId?: string; value: string } {
  const separator = ref.indexOf(':')
  if (separator > 0) {
    return { libraryId: ref.slice(0, separator), value: ref.slice(separator + 1) }
  }
  return { libraryId: fallbackLibrary, value: ref }
}

function qualifiedRef(libraryId: string, ref: string): string {
  return ref.includes(':') ? ref : `${libraryId}:${ref}`
}

function qualifyPolicy(policy: DeepReadonly<TeamLibraryPolicy>, libraryId: string): TeamLibraryPolicy {
  return {
    required: {
      skills: policy.required.skills.map((ref) => qualifiedRef(libraryId, ref)),
      mcp: policy.required.mcp.map((ref) => qualifiedRef(libraryId, ref)),
    },
    recommended: {
      skills: policy.recommended.skills.map((ref) => qualifiedRef(libraryId, ref)),
      mcp: policy.recommended.mcp.map((ref) => qualifiedRef(libraryId, ref)),
    },
    blocked: policy.blocked.map((item) => ({
      ...item,
      ref: qualifiedRef(libraryId, item.ref),
    })),
  }
}

function effectivePolicy(
  config: TeamProjectConfig,
  catalogs: readonly DeepReadonly<TeamLibraryCatalog>[],
): TeamLibraryPolicy {
  const policies: TeamLibraryPolicy[] = catalogs
    .filter((catalog) => !config.library || catalog.source.libraryId === config.library)
    .map((catalog) => qualifyPolicy(catalog.policy, catalog.source.libraryId))
  for (const teamRef of config.teams) {
    const parsed = splitRef(teamRef, config.library)
    const matches = catalogs.filter((catalog) =>
      (!parsed.libraryId || catalog.source.libraryId === parsed.libraryId) &&
      catalog.teamPolicies[parsed.value],
    )
    if (matches.length !== 1) continue
    const catalog = matches[0]!
    policies.push(qualifyPolicy(catalog.teamPolicies[parsed.value]!, catalog.source.libraryId))
  }
  if (config.policy) {
    policies.push(config.library ? qualifyPolicy(config.policy, config.library) : config.policy)
  }
  return policies.length > 0 ? mergeTeamPolicies(...policies) : emptyTeamPolicy()
}

function uniqueMatch<T>(items: T[]): T | null {
  return items.length === 1 ? items[0]! : null
}

function resolveSkill(
  ref: string,
  library: string | undefined,
  skills: readonly TeamLibrarySkillSummary[],
): TeamLibrarySkillSummary | null {
  const parsed = splitRef(ref, library)
  return uniqueMatch(skills.filter((item) =>
    (!parsed.libraryId || item.libraryId === parsed.libraryId) &&
    (item.path === parsed.value || item.name === parsed.value),
  ))
}

function resolveMcp(
  ref: string,
  library: string | undefined,
  mcpServers: readonly TeamLibraryMcpSummary[],
): TeamLibraryMcpSummary | null {
  const parsed = splitRef(ref, library)
  return uniqueMatch(mcpServers.filter((item) =>
    (!parsed.libraryId || item.libraryId === parsed.libraryId) &&
    (item.path === parsed.value || item.name === parsed.value),
  ))
}

function resolveBundle(
  ref: string,
  library: string | undefined,
  bundles: readonly TeamLibraryBundleSummary[],
): TeamLibraryBundleSummary | null {
  const parsed = splitRef(ref, library)
  return uniqueMatch(bundles.filter((item) =>
    (!parsed.libraryId || item.libraryId === parsed.libraryId) &&
    (item.id === parsed.value || item.path === parsed.value || item.name === parsed.value),
  ))
}

function installationTargetsProject(record: TeamLibraryInstallRecord, projectRoot: string): boolean {
  if (record.type === 'skill') {
    return record.target.scope === 'project' &&
      normalizedPath(record.target.projectRoot) === normalizedPath(projectRoot)
  }
  return record.target.scope !== 'user' &&
    normalizedPath(record.target.projectRoot) === normalizedPath(projectRoot)
}

function resourceState(
  resource: TeamLibrarySkillSummary | TeamLibraryMcpSummary,
  projectRoot: string,
  installations: readonly TeamLibraryInstallRecord[],
): TeamProjectRequirementState {
  const records = installations.filter((record) =>
    record.type === resource.type &&
    record.libraryId === resource.libraryId &&
    record.path === resource.path &&
    installationTargetsProject(record, projectRoot),
  )
  if (records.length === 0) return 'missing'
  if (records.some((record) => record.status === 'current')) return 'satisfied'
  if (records.some((record) => record.status === 'outdated')) return 'outdated'
  if (records.every((record) => record.status === 'missing')) return 'missing'
  const current = records.some((record) =>
    record.type === 'skill' && resource.type === 'skill'
      ? record.contentHash === resource.contentHash
      : record.type === 'mcp' && resource.type === 'mcp'
        ? record.definitionHash === resource.definitionHash
        : false,
  )
  return current ? 'satisfied' : 'outdated'
}

function directStatus(
  type: 'skill' | 'mcp',
  ref: string,
  config: TeamProjectConfig,
  projectRoot: string,
  skills: readonly TeamLibrarySkillSummary[],
  mcpServers: readonly TeamLibraryMcpSummary[],
  installations: readonly TeamLibraryInstallRecord[],
  policy: TeamLibraryPolicy,
): TeamProjectRequirementStatus {
  const resource = type === 'skill'
    ? resolveSkill(ref, config.library, skills)
    : resolveMcp(ref, config.library, mcpServers)
  if (!resource) {
    return { type, ref, label: ref, state: 'unresolved', reason: 'unresolved-ref' }
  }
  const policyReason = blockedTeamAssetReason(
    policy,
    `${resource.libraryId}:${resource.path}`,
    resource.version,
  )
  if (policyReason) {
    return {
      type,
      ref,
      label: resource.name,
      state: 'blocked',
      reason: 'blocked-policy',
      policyReason,
    }
  }
  return {
    type,
    ref,
    label: resource.name,
    state: resourceState(resource, projectRoot, installations),
  }
}

function bundleStatus(
  ref: string,
  config: TeamProjectConfig,
  projectRoot: string,
  bundles: readonly TeamLibraryBundleSummary[],
  skills: readonly TeamLibrarySkillSummary[],
  mcpServers: readonly TeamLibraryMcpSummary[],
  installations: readonly TeamLibraryInstallRecord[],
  policy: TeamLibraryPolicy,
): TeamProjectRequirementStatus {
  const bundle = resolveBundle(ref, config.library, bundles)
  if (!bundle) {
    return { type: 'bundle', ref, label: ref, state: 'unresolved', reason: 'unresolved-ref' }
  }
  if (bundle.missingSkills.length + bundle.missingMcpServers.length > 0) {
    return { type: 'bundle', ref, label: bundle.name, state: 'unresolved', reason: 'bundle-missing-members' }
  }
  const memberStates = [
    ...bundle.skills.map((path) => {
      const resource = resolveSkill(`${bundle.libraryId}:${path}`, undefined, skills)
      if (!resource) return 'unresolved'
      if (blockedTeamAssetReason(policy, `${resource.libraryId}:${resource.path}`, resource.version)) return 'blocked'
      return resourceState(resource, projectRoot, installations)
    }),
    ...bundle.mcpServers.map((path) => {
      const resource = resolveMcp(`${bundle.libraryId}:${path}`, undefined, mcpServers)
      if (!resource) return 'unresolved'
      if (blockedTeamAssetReason(policy, `${resource.libraryId}:${resource.path}`, resource.version)) return 'blocked'
      return resourceState(resource, projectRoot, installations)
    }),
  ]
  const state = memberStates.includes('blocked')
    ? 'blocked'
    : memberStates.includes('unresolved')
    ? 'unresolved'
    : memberStates.includes('missing')
      ? 'missing'
      : memberStates.includes('outdated')
        ? 'outdated'
        : 'satisfied'
  const incomplete = memberStates.filter((item) => item !== 'satisfied').length
  return {
    type: 'bundle',
    ref,
    label: bundle.name,
    state,
    ...(state === 'blocked'
      ? { reason: 'blocked-policy' as const }
      : incomplete > 0
        ? { reason: 'bundle-incomplete' as const, detail: incomplete }
        : {}),
  }
}

async function refresh(): Promise<void> {
  const { projectRoots } = useSettings()
  loading.value = true
  try {
    projectConfigs.value = await Promise.all(
      projectRoots.value.map((root) => window.skillsManager.teamProjectConfig(root)),
    )
  } finally {
    loading.value = false
  }
}

export function useTeamProjects() {
  const { projectRoots } = useSettings()
  const { catalogs, bundles, skills, mcpServers, installations } = useTeamLibraries()
  if (!initialized) {
    initialized = true
    void refresh()
    watch(
      () => [...projectRoots.value],
      () => void refresh(),
    )
  }
  const projects = computed<TeamProjectCompliance[]>(() => projectConfigs.value.map((result) => {
    const policy = result.config ? effectivePolicy(result.config, catalogs.value) : emptyTeamPolicy()
    const requirements = result.config
      ? [
          ...result.config.requires.bundles.map((ref) => bundleStatus(
            ref,
            result.config!,
            result.projectRoot,
            bundles.value,
            skills.value,
            mcpServers.value,
            installations.value,
            policy,
          )),
          ...[...new Set([...result.config.requires.skills, ...policy.required.skills])].map((ref) => directStatus(
            'skill',
            ref,
            result.config!,
            result.projectRoot,
            skills.value,
            mcpServers.value,
            installations.value,
            policy,
          )),
          ...[...new Set([...result.config.requires.mcp, ...policy.required.mcp])].map((ref) => directStatus(
            'mcp',
            ref,
            result.config!,
            result.projectRoot,
            skills.value,
            mcpServers.value,
            installations.value,
            policy,
          )),
        ]
      : []
    return {
      ...result,
      requirements,
      satisfied: requirements.filter((item) => item.state === 'satisfied').length,
      missing: requirements.filter((item) => item.state === 'missing').length,
      outdated: requirements.filter((item) => item.state === 'outdated').length,
      unresolved: requirements.filter((item) => item.state === 'unresolved').length,
      blocked: requirements.filter((item) => item.state === 'blocked').length,
    }
  }))
  const attentionCount = computed(() => projects.value.reduce(
    (total, project) => total + project.missing + project.outdated + project.unresolved + project.blocked,
    0,
  ))
  return {
    projects,
    loading: readonly(loading),
    attentionCount,
    refresh,
  }
}
