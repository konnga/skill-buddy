import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeCodeAdapter } from './claude-code.js'
import { CodexAdapter } from './codex.js'
import { CursorAdapter } from './cursor.js'
import { OpenCodeAdapter } from './opencode.js'
import { WorkBuddyAdapter } from './workbuddy.js'
import type { SkillDirAdapter } from './skill-dir-adapter.js'
import type { Skill } from '../types.js'

const sample: Skill = {
  name: 'commit-style',
  description: 'Write conventional commits',
  version: '1.0.0',
  tags: ['git', 'style'],
  content: '# Commit style\n\nAlways use conventional commits.',
}

interface Case {
  label: string
  make: (home: string) => SkillDirAdapter
  detectDir: string[]
  userDir: string[]
  /** null = platform has no project scope */
  projectDir: ((project: string) => string[]) | null
}

const cases: Case[] = [
  {
    label: 'ClaudeCodeAdapter',
    make: (home) => new ClaudeCodeAdapter(home),
    detectDir: ['.claude'],
    userDir: ['.claude', 'skills'],
    projectDir: (p) => [p, '.claude', 'skills'],
  },
  {
    label: 'OpenCodeAdapter',
    make: (home) => new OpenCodeAdapter(home),
    detectDir: ['.config', 'opencode'],
    userDir: ['.config', 'opencode', 'skills'],
    projectDir: (p) => [p, '.opencode', 'skills'],
  },
  {
    label: 'CodexAdapter',
    make: (home) => new CodexAdapter(home),
    detectDir: ['.codex'],
    userDir: ['.agents', 'skills'],
    projectDir: (p) => [p, '.agents', 'skills'],
  },
  {
    label: 'CursorAdapter',
    make: (home) => new CursorAdapter(home),
    detectDir: ['.cursor'],
    userDir: ['.cursor', 'skills'],
    projectDir: (p) => [p, '.cursor', 'skills'],
  },
  {
    label: 'WorkBuddyAdapter',
    make: (home) => new WorkBuddyAdapter(home),
    detectDir: ['.workbuddy'],
    userDir: ['.workbuddy', 'skills'],
    projectDir: null,
  },
]

describe.each(cases)('$label', ({ make, detectDir, userDir, projectDir }) => {
  let home: string
  let adapter: SkillDirAdapter

  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'skm-test-'))
    adapter = make(home)
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  it('detects presence via its config directory', async () => {
    expect(await adapter.detect()).toBe(false)
    await fs.mkdir(join(home, ...detectDir), { recursive: true })
    expect(await adapter.detect()).toBe(true)
  })

  it('round-trips a skill through install and list (user scope)', async () => {
    const path = await adapter.install(sample, 'user')
    expect(path).toBe(join(home, ...userDir, 'commit-style'))

    const listed = await adapter.list('user')
    expect(listed).toHaveLength(1)
    const { skill } = listed[0]!
    expect(skill.name).toBe(sample.name)
    expect(skill.description).toBe(sample.description)
    expect(skill.version).toBe(sample.version)
    expect(skill.tags).toEqual(sample.tags)
    expect(skill.content).toBe(sample.content)
  })

  it(projectDir ? 'supports project scope' : 'rejects project scope (unsupported)', async () => {
    const project = join(home, 'repo')
    if (projectDir) {
      await adapter.install(sample, 'project', project)
      const listed = await adapter.list('project', project)
      expect(listed).toHaveLength(1)
      expect(listed[0]!.path).toBe(join(...projectDir(project), 'commit-style'))
    } else {
      await expect(adapter.install(sample, 'project', project)).rejects.toThrow(
        /no skills directory/,
      )
      expect(await adapter.list('project', project)).toHaveLength(0)
    }
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
      join(home, ...userDir, 'commit-style', 'assets', 'template.txt'),
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

  it('ignores directories without SKILL.md', async () => {
    const dir = join(home, ...userDir, 'not-a-skill')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'notes.txt'), 'x', 'utf8')
    expect(await adapter.list('user')).toHaveLength(0)
  })
})
