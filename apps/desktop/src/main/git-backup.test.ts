import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import type { InstalledSkill } from '@skillbuddy/core'
import { prepareGitRestore, pushGitBackup } from './git-backup.js'
import { PathAccessPolicy } from './path-policy.js'

const execFileAsync = promisify(execFile)
const temporaryRoots: string[] = []

async function temporaryDirectory(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

async function git(cwd: string | undefined, args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd })).stdout.trim()
}

async function fixture(name: string, content = `# ${name}`): Promise<InstalledSkill> {
  const root = await temporaryDirectory('skillbuddy-backup-skill-')
  const directory = join(root, name)
  await fs.mkdir(join(directory, 'assets'), { recursive: true })
  await fs.writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: fixture\n---\n\n${content}\n`,
    'utf8',
  )
  await fs.writeFile(join(directory, 'assets', 'note.txt'), 'portable', 'utf8')
  return {
    agent: 'codex',
    scope: 'user',
    path: directory,
    enabled: true,
    skill: {
      name,
      description: 'fixture',
      tags: [],
      content,
      resources: { 'assets/note.txt': join(directory, 'assets', 'note.txt') },
    },
  }
}

async function bareRepository(): Promise<string> {
  const remote = await temporaryDirectory('skillbuddy-backup-remote-')
  await git(undefined, ['init', '--bare', remote])
  return remote
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('Git backup', () => {
  it('推送可移植快照并从指定分支恢复', async () => {
    const remote = await bareRepository()
    const skill = await fixture('alpha')
    const request = {
      remoteUrl: remote,
      branch: 'devices/main',
      presets: [{ name: 'Frontend', skills: ['alpha'] }],
    }

    const pushed = await pushGitBackup(request, {
      allowLocalRemote: true,
      scan: async () => [skill],
    })
    expect(pushed).toMatchObject({ committed: true, skills: 1, presets: 1 })

    const preview = await prepareGitRestore(request, new PathAccessPolicy(), {
      allowLocalRemote: true,
    })
    temporaryRoots.push(preview.root)
    expect(preview.presets).toEqual([{ name: 'Frontend', skills: ['alpha'] }])
    expect(preview.items.map((item) => item.skill.name)).toEqual(['alpha'])
    expect(await fs.readFile(preview.items[0]!.skill.resources!['assets/note.txt']!, 'utf8')).toBe(
      'portable',
    )
  })

  it('相同内容重复备份不产生提交', async () => {
    const remote = await bareRepository()
    const skill = await fixture('alpha')
    const request = { remoteUrl: remote, branch: 'main', presets: [] }

    const options = { allowLocalRemote: true, scan: async () => [skill] }
    expect((await pushGitBackup(request, options)).committed).toBe(true)
    expect((await pushGitBackup(request, options)).committed).toBe(false)
  })

  it('拒绝存在漂移的 Skill 和内嵌凭据的远程地址', async () => {
    const first = await fixture('alpha', '# first')
    const second = await fixture('alpha', '# second')
    await expect(
      pushGitBackup(
        { remoteUrl: await bareRepository(), branch: 'main', presets: [] },
        { allowLocalRemote: true, scan: async () => [first, second] },
      ),
    ).rejects.toThrow('resolve Skill drift')

    await expect(
      pushGitBackup(
        { remoteUrl: 'https://token@example.com/private.git', branch: 'main', presets: [] },
        { scan: async () => [] },
      ),
    ).rejects.toThrow('must not contain credentials')
    await expect(
      pushGitBackup(
        { remoteUrl: 'git://example.com/private.git', branch: 'main', presets: [] },
        { scan: async () => [] },
      ),
    ).rejects.toThrow('use HTTPS or SSH')
  })

  it('拒绝 manifest 与仓库 Skill 内容不一致的快照', async () => {
    const remote = await bareRepository()
    const skill = await fixture('alpha')
    const request = { remoteUrl: remote, branch: 'main', presets: [] }
    await pushGitBackup(request, { allowLocalRemote: true, scan: async () => [skill] })

    const worktree = await temporaryDirectory('skillbuddy-backup-tamper-')
    await git(undefined, ['clone', remote, worktree])
    await fs.appendFile(join(worktree, 'skills', 'alpha', 'SKILL.md'), '\nTampered\n', 'utf8')
    await git(worktree, ['add', '.'])
    await git(worktree, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'tamper'])
    await git(worktree, ['push', 'origin', 'main'])

    await expect(
      prepareGitRestore(request, new PathAccessPolicy(), { allowLocalRemote: true }),
    ).rejects.toThrow(
      'does not match its manifest',
    )
  })

  it('推送前拒绝远程仓库中的符号链接', async () => {
    const remote = await bareRepository()
    const worktree = await temporaryDirectory('skillbuddy-backup-symlink-')
    const outside = join(await temporaryDirectory('skillbuddy-backup-outside-'), 'outside.json')
    await git(undefined, ['clone', remote, worktree])
    await fs.writeFile(outside, 'unchanged', 'utf8')
    await fs.symlink(outside, join(worktree, 'skillbuddy-backup.json'))
    await git(worktree, ['add', '.'])
    await git(worktree, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'link'])
    await git(worktree, ['push', 'origin', 'HEAD:main'])

    await expect(
      pushGitBackup(
        { remoteUrl: remote, branch: 'main', presets: [] },
        { allowLocalRemote: true, scan: async () => [] },
      ),
    ).rejects.toThrow('symbolic links')
    expect(await fs.readFile(outside, 'utf8')).toBe('unchanged')
  })
})
