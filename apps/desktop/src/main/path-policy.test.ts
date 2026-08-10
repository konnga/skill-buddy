import { promises as fs } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SkillRoot } from '@skillbuddy/core'
import { PathAccessPolicy, validateCustomPlatform } from './path-policy.js'

let root: string
let managedRoot: string
let skillRoot: string
let outsideRoot: string
let policy: PathAccessPolicy

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-path-policy-'))
  managedRoot = join(root, 'skills')
  skillRoot = join(managedRoot, 'safe-skill')
  outsideRoot = join(root, 'outside')
  await fs.mkdir(skillRoot, { recursive: true })
  await fs.mkdir(outsideRoot, { recursive: true })
  await fs.writeFile(join(skillRoot, 'SKILL.md'), 'safe', 'utf8')
  await fs.writeFile(join(outsideRoot, 'secret.txt'), 'secret', 'utf8')
  policy = new PathAccessPolicy()
  policy.setSkillRoots([
    {
      agent: 'codex',
      scope: 'user',
      path: managedRoot,
      origin: 'user',
      readOnly: false,
    } satisfies SkillRoot,
  ])
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('PathAccessPolicy', () => {
  it('allows files inside scanned Skill roots and rejects unrelated paths', async () => {
    await expect(policy.assertReadable(join(skillRoot, 'SKILL.md'))).resolves.toBeUndefined()
    await expect(policy.assertReadable(join(outsideRoot, 'secret.txt'))).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })

  it('only allows deleting direct children of writable Skill roots', async () => {
    await expect(policy.assertWritableSkillDirectory(skillRoot)).resolves.toBeUndefined()
    const unrelated = join(managedRoot, 'unrelated')
    await fs.mkdir(unrelated)
    await expect(policy.assertWritableSkillDirectory(unrelated)).rejects.toThrow()
    await fs.mkdir(join(skillRoot, 'nested'))
    await expect(policy.assertWritableSkillDirectory(join(skillRoot, 'nested'))).rejects.toThrow()

    policy.setSkillRoots([
      {
        agent: 'codex',
        scope: 'user',
        path: managedRoot,
        origin: 'system',
        readOnly: true,
      },
    ])
    await expect(policy.assertWritableSkillDirectory(skillRoot)).rejects.toThrow(
      'not a managed Skill directory',
    )
  })

  it('only allows operations against scanned writable target roots', () => {
    expect(() => policy.assertWritableTargetRoot(managedRoot)).not.toThrow()
    expect(() => policy.assertWritableTargetRoot(outsideRoot)).toThrow(
      'outside the managed platform directories',
    )
  })

  it.runIf(process.platform !== 'win32')('blocks symlinks that escape an allowed root', async () => {
    const link = join(skillRoot, 'escaped.txt')
    await fs.symlink(join(outsideRoot, 'secret.txt'), link)
    await expect(policy.assertReadable(link)).rejects.toThrow(
      'outside the allowed Skill directories',
    )
  })

  it('tracks app-owned temporary roots explicitly', async () => {
    policy.grantTemporaryRoot(outsideRoot, true)
    await expect(policy.assertReadable(join(outsideRoot, 'secret.txt'))).resolves.toBeUndefined()
    expect(() => policy.assertTemporaryRoot(outsideRoot)).not.toThrow()
    policy.revokeTemporaryRoot(outsideRoot)
    expect(() => policy.assertTemporaryRoot(outsideRoot)).toThrow('not owned by SkillBuddy')
  })

  it('does not allow Renderer cleanup for internal AI workspaces', () => {
    policy.grantTemporaryRoot(outsideRoot)
    expect(() => policy.assertTemporaryRoot(outsideRoot)).toThrow('not owned by SkillBuddy')
  })

  it('rejects installation resources outside authorized roots', async () => {
    await expect(
      policy.assertSkillResources({
        name: 'unsafe-skill',
        description: 'unsafe',
        content: 'unsafe',
        resources: { 'secret.txt': join(outsideRoot, 'secret.txt') },
      }),
    ).rejects.toThrow('outside the allowed Skill directories')
  })
})

describe('validateCustomPlatform', () => {
  it('accepts home-contained and project-relative paths', () => {
    expect(
      validateCustomPlatform({
        id: 'private-agent',
        displayName: ' Private Agent ',
        userSkillsDir: '~/.private-agent/skills',
        projectSkillsDir: '.private-agent/skills',
        detectPath: '~/.private-agent',
      }),
    ).toMatchObject({ displayName: 'Private Agent' })
  })

  it('rejects home and project directory escapes', () => {
    expect(() =>
      validateCustomPlatform({
        id: 'private-agent',
        displayName: 'Private Agent',
        userSkillsDir: '/',
        projectSkillsDir: '.private-agent/skills',
        detectPath: join(homedir(), '.private-agent'),
      }),
    ).toThrow('inside the user home directory')
    expect(() =>
      validateCustomPlatform({
        id: 'private-agent',
        displayName: 'Private Agent',
        userSkillsDir: '~/.private-agent/skills',
        projectSkillsDir: '../outside',
        detectPath: '~/.private-agent',
      }),
    ).toThrow('cannot escape the project root')
  })

  it('requires custom installation targets to be Skills directories', () => {
    expect(() =>
      validateCustomPlatform({
        id: 'private-agent',
        displayName: 'Private Agent',
        userSkillsDir: '~/Documents',
        projectSkillsDir: null,
        detectPath: '~/.private-agent',
      }),
    ).toThrow('directory named skills')
  })
})
