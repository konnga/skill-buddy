import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from '../platforms.js'
import { createPlatformAdapter } from './factory.js'
import type { Skill } from '../types.js'

let home: string

function adapter(agent: 'workbuddy' | 'workbuddy-ai') {
  const definition = BUILTIN_PLATFORMS.find((platform) => platform.id === agent)
  if (!definition) throw new Error(`missing platform ${agent}`)
  return createPlatformAdapter(definition, home)
}

const sample: Skill = {
  name: 'shared-name',
  description: 'Edition-specific skill',
  content: '# Instructions',
}

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-workbuddy-'))
})

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe('WorkBuddy edition isolation', () => {
  it.each([
    ['workbuddy', 'workbuddy-ai'],
    ['workbuddy-ai', 'workbuddy'],
  ] as const)('detects %s without marking %s as installed', async (installed, missing) => {
    await fs.mkdir(join(home, `.${installed}`))

    expect(await adapter(installed).detect()).toBe(true)
    expect(await adapter(missing).detect()).toBe(false)
  })

  it('installs and updates same-name Skills independently in each edition', async () => {
    const domestic = adapter('workbuddy')
    const international = adapter('workbuddy-ai')
    await domestic.install({ ...sample, content: '# Domestic' }, 'user')
    const path = await international.install(sample, 'user')
    await international.install({ ...sample, content: '# International' }, 'user')

    expect(path).toBe(join(home, '.workbuddy-ai', 'skills', sample.name))
    const domesticSkills = await domestic.list('user')
    const internationalSkills = await international.list('user')
    expect(domesticSkills).toHaveLength(1)
    expect(internationalSkills).toHaveLength(1)
    expect(domesticSkills[0]?.skill.content).toContain('# Domestic')
    expect(internationalSkills[0]?.skill.content).toContain('# International')
    expect(await international.detect()).toBe(true)
  })
})
