import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  it('groups installations by name', async () => {
    const result = await aggregateSkills([
      inst('a', 'claude-code', 'x'),
      inst('a', 'cursor', 'x'),
      inst('b', 'claude-code', 'y'),
    ])
    expect(result.map((r) => r.name)).toEqual(['a', 'b'])
    expect(result[0]!.installations).toHaveLength(2)
    expect(result[1]!.installations).toHaveLength(1)
  })

  it('flags drift when content differs across installations', async () => {
    const [same] = await aggregateSkills([
      inst('a', 'claude-code', 'same'),
      inst('a', 'cursor', 'same'),
    ])
    expect(same!.hasDrift).toBe(false)

    const [drifted] = await aggregateSkills([
      inst('a', 'claude-code', 'v1'),
      inst('a', 'cursor', 'v2'),
    ])
    expect(drifted!.hasDrift).toBe(true)
  })

  it('flags drift on description-only changes', async () => {
    const [drifted] = await aggregateSkills([
      inst('a', 'claude-code', 'same', 'old description'),
      inst('a', 'cursor', 'same', 'new description'),
    ])
    expect(drifted!.hasDrift).toBe(true)
  })

  it('flags drift when version, tags or resources differ', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-aggregate-'))
    const firstResource = join(root, 'first.txt')
    const secondResource = join(root, 'second.txt')
    await fs.writeFile(firstResource, 'one', 'utf8')
    await fs.writeFile(secondResource, 'two', 'utf8')
    const base = inst('a', 'claude-code', 'same')
    base.skill.version = '1.0.0'
    base.skill.tags = ['one']
    base.skill.resources = { 'reference.txt': firstResource }
    const changed = inst('a', 'cursor', 'same')
    changed.skill.version = '2.0.0'
    changed.skill.tags = ['two']
    changed.skill.resources = { 'reference.txt': secondResource }
    const [drifted] = await aggregateSkills([base, changed])
    expect(drifted!.hasDrift).toBe(true)
    await fs.rm(root, { recursive: true, force: true })
  })

  it('sorts aggregates by name', async () => {
    const result = await aggregateSkills([
      inst('zeta', 'claude-code', 'x'),
      inst('alpha', 'claude-code', 'x'),
    ])
    expect(result.map((r) => r.name)).toEqual(['alpha', 'zeta'])
  })
})
