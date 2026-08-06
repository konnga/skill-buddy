import { describe, expect, it } from 'vitest'
import { aggregateSkills } from './aggregate.js'
import type { InstalledSkill } from './types.js'

function inst(
  name: string,
  agent: string,
  content: string,
  description = 'desc',
): InstalledSkill {
  return {
    agent,
    scope: 'user',
    path: `/fake/${agent}/${name}`,
    skill: { name, description, content },
  }
}

describe('aggregateSkills', () => {
  it('groups installations by name', () => {
    const result = aggregateSkills([
      inst('a', 'claude-code', 'x'),
      inst('a', 'cursor', 'x'),
      inst('b', 'claude-code', 'y'),
    ])
    expect(result.map((r) => r.name)).toEqual(['a', 'b'])
    expect(result[0]!.installations).toHaveLength(2)
    expect(result[1]!.installations).toHaveLength(1)
  })

  it('flags drift when content differs across installations', () => {
    const [same] = aggregateSkills([
      inst('a', 'claude-code', 'same'),
      inst('a', 'cursor', 'same'),
    ])
    expect(same!.hasDrift).toBe(false)

    const [drifted] = aggregateSkills([
      inst('a', 'claude-code', 'v1'),
      inst('a', 'cursor', 'v2'),
    ])
    expect(drifted!.hasDrift).toBe(true)
  })

  it('flags drift on description-only changes', () => {
    const [drifted] = aggregateSkills([
      inst('a', 'claude-code', 'same', 'old description'),
      inst('a', 'cursor', 'same', 'new description'),
    ])
    expect(drifted!.hasDrift).toBe(true)
  })

  it('sorts aggregates by name', () => {
    const result = aggregateSkills([
      inst('zeta', 'claude-code', 'x'),
      inst('alpha', 'claude-code', 'x'),
    ])
    expect(result.map((r) => r.name)).toEqual(['alpha', 'zeta'])
  })
})
