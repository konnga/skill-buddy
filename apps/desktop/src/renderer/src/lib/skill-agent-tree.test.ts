import { describe, expect, it } from 'vitest'
import type { AggregatedSkill } from '@skillbuddy/core'
import { buildSkillAgentTree, type SkillTreeLabels } from './skill-agent-tree.js'

const labels: SkillTreeLabels = {
  agent: (id) => id,
  project: (root) => `project:${root}`,
  global: 'global',
  plugin: 'plugin',
  system: 'system',
  admin: 'admin',
  legacy: 'legacy',
}

function skill(): AggregatedSkill {
  const canonical = {
    name: 'review-code',
    description: 'Review code',
    tags: [],
    content: '# Review',
  }
  return {
    name: canonical.name,
    description: canonical.description,
    tags: [],
    hasDrift: false,
    installations: [
      {
        agent: 'codex',
        scope: 'user',
        path: '/shared/review-code',
        skill: canonical,
        contentHash: 'a',
        enabled: true,
      },
      {
        agent: 'codex',
        scope: 'project',
        projectRoot: '/workspace/one',
        path: '/workspace/one/.agents/skills/review-code',
        skill: canonical,
        contentHash: 'a',
        enabled: true,
      },
      {
        agent: 'codex',
        scope: 'project',
        projectRoot: '/workspace/one',
        path: '/workspace/one/.codex/skills/review-code',
        skill: canonical,
        contentHash: 'a',
        enabled: false,
      },
      {
        agent: 'cursor',
        scope: 'project',
        projectRoot: '/workspace/one',
        path: '/workspace/one/.cursor/skills/review-code',
        skill: canonical,
        contentHash: 'a',
        readOnly: true,
      },
    ],
  }
}

describe('skill agent tree', () => {
  it('groups installations by Agent and scope with shared status derivation', () => {
    const roots = buildSkillAgentTree({ skills: [skill()], labels })

    expect(roots.map((root) => root.key)).toEqual(['agent:codex', 'agent:cursor'])
    expect(roots[0]?.branches.map((branch) => branch.key)).toEqual([
      'user',
      'project:/workspace/one',
    ])
    expect(roots[0]?.branches[1]?.skills[0]).toMatchObject({
      readOnly: false,
      allDisabled: false,
      partiallyDisabled: true,
      hasEnabled: true,
    })
    expect(roots[1]?.branches[0]?.skills[0]).toMatchObject({
      readOnly: true,
      allDisabled: false,
      partiallyDisabled: false,
      hasEnabled: false,
    })
  })

  it('uses the selected project as root and Agents as branches', () => {
    const roots = buildSkillAgentTree({
      skills: [skill()],
      labels,
      projectFilter: '/workspace/one',
    })

    expect(roots).toHaveLength(1)
    expect(roots[0]).toMatchObject({
      key: 'project:/workspace/one',
      label: 'project:/workspace/one',
      skillCount: 1,
    })
    expect(roots[0]?.branches.map((branch) => branch.key)).toEqual([
      'agent:codex',
      'agent:cursor',
    ])
  })
})
