import type { AggregatedSkill } from '@skillbuddy/core'
import {
  deriveSkillInstallationStatus,
  matchesSkillInstallation,
  type SkillInstallation,
  type SkillInstallationFilter,
} from '@/lib/skill-installations'

type SkillOrigin = NonNullable<SkillInstallation['origin']>

export interface SkillTreeLeaf {
  skill: AggregatedSkill
  installations: SkillInstallation[]
  agentId: string
  projectFilter: string
  readOnly: boolean
  allDisabled: boolean
  partiallyDisabled: boolean
  hasEnabled: boolean
}

interface SkillTreeScope {
  key: string
  label: string
  title?: string
  projectFilter: string
  order: number
  skills: SkillTreeLeaf[]
}

interface SkillTreeAgent {
  id: string
  label: string
  skillCount: number
  scopes: SkillTreeScope[]
}

type SkillTreeNodeKind = 'agent' | 'scope'

export interface SkillTreeBranch {
  key: string
  label: string
  title?: string
  kind: SkillTreeNodeKind
  platformId?: string
  skills: SkillTreeLeaf[]
}

export interface SkillTreeRoot {
  key: string
  label: string
  title?: string
  kind: SkillTreeNodeKind
  platformId?: string
  skillCount: number
  branches: SkillTreeBranch[]
}

export interface SkillTreeLabels {
  agent: (id: string) => string
  project: (root: string) => string
  global: string
  plugin: string
  system: string
  admin: string
  legacy: string
}

interface BuildSkillAgentTreeOptions extends SkillInstallationFilter {
  skills: AggregatedSkill[]
  labels: SkillTreeLabels
}

interface ScopeIdentity {
  key: string
  label: string
  title?: string
  projectFilter: string
  order: number
}

function scopeIdentity(
  installation: SkillInstallation,
  labels: SkillTreeLabels,
): ScopeIdentity {
  const origin: SkillOrigin = installation.origin ?? installation.scope
  if (installation.scope === 'project') {
    const root = installation.projectRoot ?? installation.path
    return {
      key: `project:${root}`,
      label: labels.project(root),
      title: root,
      projectFilter: root,
      order: 10,
    }
  }

  const origins: Record<Exclude<SkillOrigin, 'project'>, { label: string; order: number }> = {
    user: { label: labels.global, order: 0 },
    plugin: { label: labels.plugin, order: 20 },
    system: { label: labels.system, order: 30 },
    admin: { label: labels.admin, order: 40 },
    legacy: { label: labels.legacy, order: 50 },
  }
  const item = origins[origin === 'project' ? 'user' : origin]
  return {
    key: origin,
    label: item.label,
    projectFilter: 'user',
    order: item.order,
  }
}

/** 构建完整的 Agent/作用域树，不让树算法依赖 Vue 响应式状态。 */
export function buildSkillAgentTree(options: BuildSkillAgentTreeOptions): SkillTreeRoot[] {
  const skillsByName = new Map(options.skills.map((skill) => [skill.name, skill]))
  const agents = new Map<
    string,
    Map<string, { meta: ScopeIdentity; skills: Map<string, SkillInstallation[]> }>
  >()

  for (const skill of options.skills) {
    const installations = skill.installations.filter((installation) =>
      matchesSkillInstallation(installation, options),
    )
    for (const installation of installations) {
      const agentScopes = agents.get(installation.agent) ?? new Map()
      const meta = scopeIdentity(installation, options.labels)
      const scope = agentScopes.get(meta.key) ?? { meta, skills: new Map() }
      const skillInstallations = scope.skills.get(skill.name) ?? []
      skillInstallations.push(installation)
      scope.skills.set(skill.name, skillInstallations)
      agentScopes.set(meta.key, scope)
      agents.set(installation.agent, agentScopes)
    }
  }

  const agentTree = [...agents.entries()]
    .map(([id, scopes]): SkillTreeAgent => {
      const scopeItems = [...scopes.values()]
        .map(({ meta, skills }): SkillTreeScope => ({
          ...meta,
          skills: [...skills.entries()].map(([name, installations]) => {
            const status = deriveSkillInstallationStatus(installations)
            return {
              skill: skillsByName.get(name)!,
              installations,
              agentId: id,
              projectFilter: meta.projectFilter,
              readOnly: status.readOnly,
              allDisabled: status.allDisabled,
              partiallyDisabled: status.partiallyDisabled,
              hasEnabled: status.hasEnabled,
            }
          }),
        }))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      return {
        id,
        label: options.labels.agent(id),
        skillCount: new Set(
          scopeItems.flatMap((scope) => scope.skills.map((item) => item.skill.name)),
        ).size,
        scopes: scopeItems,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const projectRoot = options.projectFilter
  if (projectRoot && projectRoot !== 'user') {
    const branches = agentTree.flatMap((agent): SkillTreeBranch[] => {
      const skills = agent.scopes
        .filter((scope) => scope.projectFilter === projectRoot)
        .flatMap((scope) => scope.skills)
      if (skills.length === 0) return []
      return [
        {
          key: `agent:${agent.id}`,
          label: agent.label,
          kind: 'agent',
          platformId: agent.id,
          skills,
        },
      ]
    })
    return [
      {
        key: `project:${projectRoot}`,
        label: options.labels.project(projectRoot),
        title: projectRoot,
        kind: 'scope',
        skillCount: new Set(
          branches.flatMap((branch) => branch.skills.map((leaf) => leaf.skill.name)),
        ).size,
        branches,
      },
    ]
  }

  return agentTree.map((agent): SkillTreeRoot => ({
    key: `agent:${agent.id}`,
    label: agent.label,
    kind: 'agent',
    platformId: agent.id,
    skillCount: agent.skillCount,
    branches: agent.scopes.map((scope): SkillTreeBranch => ({
      key: scope.key,
      label: scope.label,
      title: scope.title,
      kind: 'scope',
      skills: scope.skills,
    })),
  }))
}
