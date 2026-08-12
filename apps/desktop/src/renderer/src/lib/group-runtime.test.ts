import { describe, expect, it } from 'vitest'
import type { AggregatedSkill, InstalledSkill, Skill } from '@skillbuddy/core'
import { deriveGroupRuntimeState } from './group-runtime.js'

const canonical = (name: string): Skill => ({
  name,
  description: name,
  tags: [],
  content: `# ${name}`,
})

function installation(
  name: string,
  overrides: Partial<InstalledSkill> = {},
): InstalledSkill & { contentHash: string } {
  return {
    agent: 'codex',
    scope: 'user',
    path: `/user/${name}`,
    skill: canonical(name),
    contentHash: name,
    enabled: true,
    ...overrides,
  }
}

function aggregate(name: string, installations: InstalledSkill[]): AggregatedSkill {
  return {
    name,
    description: name,
    tags: [],
    hasDrift: false,
    installations: installations.map((item) => ({ ...item, contentHash: name })),
  }
}

describe('deriveGroupRuntimeState', () => {
  it('区分空合集、全部启用和全部禁用', () => {
    expect(deriveGroupRuntimeState({ name: 'empty', skills: [] }, [], {}).status).toBe('empty')

    const enabled = aggregate('a', [installation('a')])
    expect(deriveGroupRuntimeState({ name: 'on', skills: ['a'] }, [enabled], {}).status).toBe(
      'enabled',
    )

    const disabled = aggregate('a', [installation('a', { enabled: false })])
    expect(deriveGroupRuntimeState({ name: 'off', skills: ['a'] }, [disabled], {}).status).toBe(
      'disabled',
    )
  })

  it('缺失成员或启停混合时为部分启用', () => {
    const skill = aggregate('a', [
      installation('a'),
      installation('a', {
        agent: 'cursor',
        path: '/cursor/a',
        enabled: false,
      }),
    ])
    const state = deriveGroupRuntimeState(
      { name: 'mixed', skills: ['a', 'missing'] },
      [skill],
      {},
    )

    expect(state).toMatchObject({
      status: 'partial',
      totalSkills: 2,
      installedSkills: 1,
      enabledInstallations: 1,
      disabledInstallations: 1,
      manageableInstallations: 2,
      missingSkills: ['missing'],
    })
  })

  it('同时遵循 Agent、项目和来源筛选，并保留只读安装统计', () => {
    const skill = aggregate('a', [
      installation('a', {
        scope: 'project',
        projectRoot: '/one',
        path: '/one/.agents/skills/a',
        readOnly: true,
      }),
      installation('a', {
        agent: 'cursor',
        scope: 'project',
        projectRoot: '/one',
        path: '/one/.cursor/skills/a',
      }),
    ])

    const readOnly = deriveGroupRuntimeState(
      { name: 'readonly', skills: ['a'] },
      [skill],
      {
        platformId: 'codex',
        projectFilter: '/one',
        ownershipFilter: 'agent',
      },
    )
    expect(readOnly).toMatchObject({
      status: 'unavailable',
      installedSkills: 1,
      manageableInstallations: 0,
      missingSkills: [],
    })

    const manageable = deriveGroupRuntimeState(
      { name: 'managed', skills: ['a'] },
      [skill],
      {
        platformId: 'cursor',
        projectFilter: '/one',
        ownershipFilter: 'managed',
      },
    )
    expect(manageable).toMatchObject({
      status: 'enabled',
      installedSkills: 1,
      manageableInstallations: 1,
    })
  })
})
