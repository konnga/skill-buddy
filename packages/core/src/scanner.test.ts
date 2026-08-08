import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discoverClaudePluginRoots,
  discoverCodexSupplementalRoots,
} from './scanner.js'

const cleanup: string[] = []

async function tempHome(): Promise<string> {
  const path = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-scanner-'))
  cleanup.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

describe('supplemental skill roots', () => {
  it('discovers Codex legacy, system, admin and latest plugin roots', async () => {
    const home = await tempHome()
    const codexHome = join(home, '.codex')
    const oldVersion = join(codexHome, 'plugins', 'cache', 'market', 'plugin', '1.0.0')
    const newVersion = join(codexHome, 'plugins', 'cache', 'market', 'plugin', '2.0.0')
    await fs.mkdir(join(oldVersion, 'skills'), { recursive: true })
    await fs.mkdir(join(newVersion, 'skills'), { recursive: true })
    await fs.utimes(oldVersion, new Date(1_000), new Date(1_000))
    await fs.utimes(newVersion, new Date(2_000), new Date(2_000))

    const roots = await discoverCodexSupplementalRoots(home, codexHome)

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(codexHome, 'skills'),
          origin: 'legacy',
          readOnly: true,
        }),
        expect.objectContaining({
          path: join(codexHome, 'skills', '.system'),
          origin: 'system',
          readOnly: true,
        }),
        expect.objectContaining({
          path: '/etc/codex/skills',
          origin: 'admin',
          readOnly: true,
        }),
        expect.objectContaining({
          path: join(newVersion, 'skills'),
          origin: 'plugin',
          readOnly: true,
        }),
      ]),
    )
    expect(roots.some((root) => root.path === join(oldVersion, 'skills'))).toBe(false)
    expect(roots.some((root) => root.path.includes('.tmp'))).toBe(false)
  })

  it('discovers only Claude plugins listed in installed_plugins.json', async () => {
    const home = await tempHome()
    const installedPath = join(home, '.claude', 'plugins', 'cache', 'market', 'installed', '1.0.0')
    const marketplacePath = join(
      home,
      '.claude',
      'plugins',
      'marketplaces',
      'market',
      'plugins',
      'not-installed',
    )
    const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json')
    await fs.mkdir(join(installedPath, 'skills'), { recursive: true })
    await fs.mkdir(join(marketplacePath, 'skills'), { recursive: true })
    await fs.mkdir(dirname(manifestPath), { recursive: true })
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        plugins: {
          'installed@market': [
            { scope: 'user', installPath: installedPath, version: '1.0.0' },
          ],
        },
      }),
      'utf8',
    )

    const roots = await discoverClaudePluginRoots(home)

    expect(roots).toEqual([
      expect.objectContaining({
        path: join(installedPath, 'skills'),
        origin: 'plugin',
        readOnly: true,
      }),
    ])
    expect(roots.some((root) => root.path.startsWith(marketplacePath))).toBe(false)
  })

  it('preserves Claude project plugin scope from the installed manifest', async () => {
    const home = await tempHome()
    const installPath = join(home, '.claude', 'plugins', 'cache', 'market', 'local', '1.0.0')
    const projectPath = join(home, 'project')
    const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json')
    await fs.mkdir(dirname(manifestPath), { recursive: true })
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        plugins: {
          'local@market': [{ scope: 'local', installPath, projectPath }],
        },
      }),
      'utf8',
    )

    expect(await discoverClaudePluginRoots(home)).toEqual([
      expect.objectContaining({
        scope: 'project',
        projectRoot: projectPath,
        path: join(installPath, 'skills'),
      }),
    ])
  })
})
