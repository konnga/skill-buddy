import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeCodeAdapter } from './claude-code.js'
import type { Skill } from '../types.js'

let home: string
let adapter: ClaudeCodeAdapter

const sample: Skill = {
  name: 'commit-style',
  description: 'Write conventional commits',
  version: '1.0.0',
  tags: ['git', 'style'],
  content: '# Commit style\n\nAlways use conventional commits.',
}

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'skm-test-'))
  adapter = new ClaudeCodeAdapter(home)
})

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe('ClaudeCodeAdapter', () => {
  it('detects presence via ~/.claude', async () => {
    expect(await adapter.detect()).toBe(false)
    await fs.mkdir(join(home, '.claude'), { recursive: true })
    expect(await adapter.detect()).toBe(true)
  })

  it('round-trips a skill through install and list (user scope)', async () => {
    const path = await adapter.install(sample, 'user')
    expect(path).toBe(join(home, '.claude', 'skills', 'commit-style'))

    const listed = await adapter.list('user')
    expect(listed).toHaveLength(1)
    const { skill } = listed[0]!
    expect(skill.name).toBe(sample.name)
    expect(skill.description).toBe(sample.description)
    expect(skill.version).toBe(sample.version)
    expect(skill.tags).toEqual(sample.tags)
    expect(skill.content).toBe(sample.content)
  })

  it('supports project scope', async () => {
    const project = join(home, 'repo')
    await adapter.install(sample, 'project', project)
    const listed = await adapter.list('project', project)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.path).toBe(join(project, '.claude', 'skills', 'commit-style'))
  })

  it('install is idempotent (overwrite, no duplicates)', async () => {
    await adapter.install(sample, 'user')
    await adapter.install({ ...sample, description: 'updated' }, 'user')
    const listed = await adapter.list('user')
    expect(listed).toHaveLength(1)
    expect(listed[0]!.skill.description).toBe('updated')
  })

  it('copies and lists resource files', async () => {
    const resourceSrc = join(home, 'template.txt')
    await fs.writeFile(resourceSrc, 'hello', 'utf8')
    await adapter.install(
      { ...sample, resources: { 'assets/template.txt': resourceSrc } },
      'user',
    )
    const listed = await adapter.list('user')
    const resources = listed[0]!.skill.resources
    expect(resources).toBeDefined()
    expect(Object.keys(resources!)).toEqual(['assets/template.txt'])
    const copied = await fs.readFile(
      join(home, '.claude', 'skills', 'commit-style', 'assets', 'template.txt'),
      'utf8',
    )
    expect(copied).toBe('hello')
  })

  it('uninstall removes the skill directory', async () => {
    await adapter.install(sample, 'user')
    await adapter.uninstall('commit-style', 'user')
    expect(await adapter.list('user')).toHaveLength(0)
  })

  it('rejects non-kebab-case names', async () => {
    await expect(adapter.install({ ...sample, name: 'Bad Name' }, 'user')).rejects.toThrow(
      /kebab-case/,
    )
  })

  it('ignores directories without SKILL.md and unreadable entries', async () => {
    const dir = join(home, '.claude', 'skills', 'not-a-skill')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'notes.txt'), 'x', 'utf8')
    expect(await adapter.list('user')).toHaveLength(0)
  })
})
