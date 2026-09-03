import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OmpAdapter } from './adapters/omp-adapter.js'
import { BUILTIN_PLATFORMS } from './platforms.js'
import {
  discoverClaudePluginRoots,
  discoverCodexSupplementalRoots,
  discoverLingxiSupplementalRoots,
  discoverOmpSupplementalRoots,
  discoverPiSupplementalRoots,
  scanInstalledSkills,
  type SkillRoot,
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
  it('recursively scans category directories for Hermes roots', async () => {
    const home = await tempHome()
    const rootPath = join(home, '.hermes', 'skills')
    const topLevelSkill = join(rootPath, 'algorithmic-art')
    const nestedSkill = join(rootPath, 'software-development', 'systematic-debugging')
    await Promise.all([
      fs.mkdir(topLevelSkill, { recursive: true }),
      fs.mkdir(nestedSkill, { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(
        join(topLevelSkill, 'SKILL.md'),
        '---\nname: algorithmic-art\ndescription: Art\n---\n',
      ),
      fs.writeFile(
        join(nestedSkill, 'SKILL.md'),
        '---\nname: systematic-debugging\ndescription: Debugging\n---\n',
      ),
    ])

    const roots: SkillRoot[] = [{
      agent: 'hermes',
      scope: 'user',
      path: rootPath,
      origin: 'user',
      readOnly: false,
      canToggle: true,
    }]

    const installations = await scanInstalledSkills([], roots)

    expect(installations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: topLevelSkill }),
      expect.objectContaining({ path: nestedSkill }),
    ]))
    expect(installations).toHaveLength(2)
  })

  it('discovers the shared user Skills roots loaded by OMP as read-only', async () => {
    const home = await tempHome()
    const installedPlugin = join(home, '.claude', 'plugins', 'cache', 'market', 'installed', '1.0.0')
    const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json')
    await fs.mkdir(dirname(manifestPath), { recursive: true })
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        plugins: {
          'installed@market': [{ scope: 'user', installPath: installedPlugin }],
        },
      }),
      'utf8',
    )

    expect(await discoverOmpSupplementalRoots(home, [], {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(home, '.agent', 'skills'), origin: 'shared' }),
        expect.objectContaining({ path: join(home, '.agents', 'skills'), origin: 'shared' }),
        expect.objectContaining({ path: join(home, '.claude', 'skills'), origin: 'shared' }),
        expect.objectContaining({ path: join(home, '.codex', 'skills'), origin: 'shared' }),
        expect.objectContaining({
          path: join(home, '.omp', 'agent', 'managed-skills'),
          origin: 'shared',
        }),
        expect.objectContaining({ path: join(installedPlugin, 'skills'), origin: 'plugin' }),
      ]),
    )
  })

  it('scans Skills loaded by OMP from shared and plugin roots', async () => {
    const home = await tempHome()
    const sharedSkill = join(home, '.agents', 'skills', 'shared-skill')
    const installedPlugin = join(home, '.claude', 'plugins', 'cache', 'market', 'plugin', '1.0.0')
    const pluginSkill = join(installedPlugin, 'skills', 'plugin-skill')
    const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json')
    await fs.mkdir(sharedSkill, { recursive: true })
    await fs.mkdir(pluginSkill, { recursive: true })
    await fs.writeFile(
      join(sharedSkill, 'SKILL.md'),
      '---\nname: shared-skill\ndescription: Shared OMP Skill\n---\n',
    )
    await fs.writeFile(
      join(pluginSkill, 'SKILL.md'),
      '---\nname: plugin-skill\ndescription: Plugin OMP Skill\n---\n',
    )
    await fs.mkdir(dirname(manifestPath), { recursive: true })
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        plugins: {
          'plugin@market': [{ scope: 'user', installPath: installedPlugin }],
        },
      }),
      'utf8',
    )

    const roots = await discoverOmpSupplementalRoots(home, [], {})
    const installations = await scanInstalledSkills([], roots)

    expect(installations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'omp',
          path: sharedSkill,
          readOnly: true,
          skill: expect.objectContaining({ name: 'shared-skill' }),
        }),
        expect.objectContaining({
          agent: 'omp',
          path: pluginSkill,
          readOnly: true,
          skill: expect.objectContaining({ name: 'plugin-skill' }),
        }),
      ]),
    )
  })

  it('discovers the shared user and project Skills roots loaded by Pi as read-only', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')

    expect(discoverPiSupplementalRoots(home, [projectRoot])).toEqual([
      {
        agent: 'pi',
        scope: 'user',
        path: join(home, '.agents', 'skills'),
        origin: 'shared',
        readOnly: true,
        canToggle: false,
      },
      {
        agent: 'pi',
        scope: 'project',
        path: join(projectRoot, '.agents', 'skills'),
        projectRoot,
        origin: 'shared',
        readOnly: true,
        canToggle: false,
      },
    ])
  })

  it('uses the active OMP profile and discovers project shared providers', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')
    const roots = await discoverOmpSupplementalRoots(home, [projectRoot], { OMP_PROFILE: 'work' })
    const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'omp')!
    const adapter = new OmpAdapter(def, home, { OMP_PROFILE: 'work' })

    expect(adapter.skillsDir('user')).toBe(
      join(home, '.omp', 'profiles', 'work', 'agent', 'skills'),
    )

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(home, '.omp', 'profiles', 'work', 'agent', 'managed-skills'),
          scope: 'user',
        }),
        expect.objectContaining({
          path: join(projectRoot, '.agents', 'skills'),
          scope: 'project',
          projectRoot,
          origin: 'shared',
        }),
        expect.objectContaining({
          path: join(projectRoot, '.github', 'skills'),
          scope: 'project',
          projectRoot,
          origin: 'shared',
        }),
      ]),
    )
  })

  it('preserves project Claude plugin scope and skips disabled plugins for OMP', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')
    const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json')
    const localPlugin = join(home, 'plugins', 'local')
    const disabledRecord = join(home, 'plugins', 'disabled-record')
    const disabledSetting = join(home, 'plugins', 'disabled-setting')
    await fs.mkdir(dirname(manifestPath), { recursive: true })
    await fs.mkdir(join(home, '.claude'), { recursive: true })
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        plugins: {
          'local@market': [{ scope: 'local', projectPath: projectRoot, installPath: localPlugin }],
          'record@market': [{ installPath: disabledRecord, enabled: false }],
          'setting@market': [{ installPath: disabledSetting }],
        },
      }),
    )
    await fs.writeFile(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'setting@market': false } }),
    )

    const roots = await discoverOmpSupplementalRoots(home, [projectRoot], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(localPlugin, 'skills'),
          scope: 'project',
          projectRoot,
          origin: 'plugin',
        }),
      ]),
    )
    expect(roots.some((root) => root.path === join(disabledRecord, 'skills'))).toBe(false)
    expect(roots.some((root) => root.path === join(disabledSetting, 'skills'))).toBe(false)
  })

  it('discovers project-configured OMP extension Skills with project scope', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')
    const extensionRoot = join(projectRoot, 'extensions', 'review-tools')
    await fs.mkdir(join(projectRoot, '.omp'), { recursive: true })
    await fs.writeFile(
      join(projectRoot, '.omp', 'config.yml'),
      'extensions:\n  - ./extensions/review-tools\n',
    )

    expect(await discoverOmpSupplementalRoots(home, [projectRoot], {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(extensionRoot, 'skills'),
          scope: 'project',
          projectRoot,
          origin: 'plugin',
        }),
      ]),
    )
  })

  it('resolves OMP extensions independently for every active project', async () => {
    const home = await tempHome()
    const firstProject = join(home, 'first-project')
    const secondProject = join(home, 'second-project')
    await Promise.all([
      fs.mkdir(join(firstProject, '.omp'), { recursive: true }),
      fs.mkdir(join(secondProject, '.omp'), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(join(firstProject, '.omp', 'config.yml'), 'extensions:\n  - ./extensions/first\n'),
      fs.writeFile(join(secondProject, '.omp', 'config.yml'), 'extensions:\n  - ./extensions/second\n'),
    ])

    const roots = await discoverOmpSupplementalRoots(home, [firstProject, secondProject], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(firstProject, 'extensions', 'first', 'skills'),
          projectRoot: firstProject,
        }),
        expect.objectContaining({
          path: join(secondProject, 'extensions', 'second', 'skills'),
          projectRoot: secondProject,
        }),
      ]),
    )
  })

  it('resolves relative user OMP extensions against each active project', async () => {
    const home = await tempHome()
    const firstProject = join(home, 'first-project')
    const secondProject = join(home, 'second-project')
    await fs.mkdir(join(home, '.omp', 'agent'), { recursive: true })
    await fs.writeFile(
      join(home, '.omp', 'agent', 'config.yml'),
      'extensions:\n  - ./extensions/shared\n',
    )

    const roots = await discoverOmpSupplementalRoots(home, [firstProject, secondProject], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(firstProject, 'extensions', 'shared', 'skills'),
          scope: 'user',
        }),
        expect.objectContaining({
          path: join(secondProject, 'extensions', 'shared', 'skills'),
          scope: 'user',
        }),
      ]),
    )
  })

  it('does not fall back to legacy user settings when canonical OMP YAML exists', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')
    const agentDir = join(home, '.omp', 'agent')
    await fs.mkdir(agentDir, { recursive: true })
    await fs.writeFile(join(agentDir, 'config.yml'), 'theme: dark\n')
    await fs.writeFile(
      join(agentDir, 'settings.json'),
      JSON.stringify({ extensions: ['./legacy-extension'] }),
    )

    const roots = await discoverOmpSupplementalRoots(home, [projectRoot], {})

    expect(
      roots.some(
        (root) => root.path === join(projectRoot, 'legacy-extension', 'skills'),
      ),
    ).toBe(false)
  })

  it('allows project legacy settings to override user OMP extensions', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')
    await Promise.all([
      fs.mkdir(join(projectRoot, '.omp'), { recursive: true }),
      fs.mkdir(join(home, '.omp', 'agent'), { recursive: true }),
    ])
    await fs.writeFile(join(projectRoot, '.omp', 'config.yml'), 'theme: dark\n')
    await fs.writeFile(
      join(projectRoot, '.omp', 'settings.json'),
      JSON.stringify({ extensions: ['./project-extension'] }),
    )
    await fs.writeFile(
      join(home, '.omp', 'agent', 'config.yml'),
      'extensions:\n  - ./user-extension\n',
    )

    const roots = await discoverOmpSupplementalRoots(home, [projectRoot], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(projectRoot, 'project-extension', 'skills'),
          scope: 'project',
          projectRoot,
        }),
      ]),
    )
    expect(
      roots.some((root) => root.path === join(projectRoot, 'user-extension', 'skills')),
    ).toBe(false)
  })

  it('does not apply Claude enabledPlugins settings to the OMP plugin registry', async () => {
    const home = await tempHome()
    const pluginRoot = join(home, 'plugins', 'omp-marketplace')
    const registryPath = join(home, '.omp', 'plugins', 'installed_plugins.json')
    await Promise.all([
      fs.mkdir(dirname(registryPath), { recursive: true }),
      fs.mkdir(join(home, '.claude'), { recursive: true }),
    ])
    await fs.writeFile(
      registryPath,
      JSON.stringify({
        plugins: { 'shared-id@market': [{ installPath: pluginRoot }] },
      }),
    )
    await fs.writeFile(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'shared-id@market': false } }),
    )

    const roots = await discoverOmpSupplementalRoots(home, [], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(pluginRoot, 'skills'), origin: 'plugin' }),
      ]),
    )
  })

  it('lets the OMP registry replace Claude plugins with the same id', async () => {
    const home = await tempHome()
    const claudePlugin = join(home, 'plugins', 'claude-copy')
    const ompPlugin = join(home, 'plugins', 'omp-copy')
    const disabledClaudePlugin = join(home, 'plugins', 'disabled-claude-copy')
    const claudeRegistry = join(home, '.claude', 'plugins', 'installed_plugins.json')
    const ompRegistry = join(home, '.omp', 'plugins', 'installed_plugins.json')
    await Promise.all([
      fs.mkdir(dirname(claudeRegistry), { recursive: true }),
      fs.mkdir(dirname(ompRegistry), { recursive: true }),
    ])
    await fs.writeFile(
      claudeRegistry,
      JSON.stringify({
        plugins: {
          'same@market': [{ installPath: claudePlugin }],
          'disabled@market': [{ installPath: disabledClaudePlugin }],
        },
      }),
    )
    await fs.writeFile(
      ompRegistry,
      JSON.stringify({
        plugins: {
          'same@market': [{ installPath: ompPlugin }],
          'disabled@market': [{ installPath: join(home, 'plugins', 'disabled-omp'), enabled: false }],
        },
      }),
    )

    const roots = await discoverOmpSupplementalRoots(home, [], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(ompPlugin, 'skills'), origin: 'plugin' }),
      ]),
    )
    expect(roots.some((root) => root.path === join(claudePlugin, 'skills'))).toBe(false)
    expect(roots.some((root) => root.path === join(disabledClaudePlugin, 'skills'))).toBe(false)
  })

  it('lets project OMP registries shadow user plugins with the same id', async () => {
    const home = await tempHome()
    const projectRoot = join(home, 'project')
    const userPlugin = join(home, 'plugins', 'user-copy')
    const projectPlugin = join(home, 'plugins', 'project-copy')
    const userRegistry = join(home, '.omp', 'plugins', 'installed_plugins.json')
    const projectRegistry = join(projectRoot, '.omp', 'plugins', 'installed_plugins.json')
    await Promise.all([
      fs.mkdir(dirname(userRegistry), { recursive: true }),
      fs.mkdir(dirname(projectRegistry), { recursive: true }),
    ])
    await fs.writeFile(
      userRegistry,
      JSON.stringify({ plugins: { 'same@market': [{ installPath: userPlugin }] } }),
    )
    await fs.writeFile(
      projectRegistry,
      JSON.stringify({ plugins: { 'same@market': [{ installPath: projectPlugin }] } }),
    )

    const roots = await discoverOmpSupplementalRoots(home, [projectRoot], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(projectPlugin, 'skills'),
          scope: 'project',
          projectRoot,
        }),
      ]),
    )
    expect(roots.some((root) => root.path === join(userPlugin, 'skills'))).toBe(false)
  })

  it('keeps Claude enabledPlugins settings scoped to their project', async () => {
    const home = await tempHome()
    const firstProject = join(home, 'first-project')
    const secondProject = join(home, 'second-project')
    const firstPlugin = join(home, 'plugins', 'first')
    const secondPlugin = join(home, 'plugins', 'second')
    const registryPath = join(home, '.claude', 'plugins', 'installed_plugins.json')
    await Promise.all([
      fs.mkdir(dirname(registryPath), { recursive: true }),
      fs.mkdir(join(firstProject, '.claude'), { recursive: true }),
      fs.mkdir(join(secondProject, '.claude'), { recursive: true }),
    ])
    await fs.writeFile(
      registryPath,
      JSON.stringify({
        plugins: {
          'first@market': [
            { scope: 'project', projectPath: firstProject, installPath: firstPlugin },
          ],
          'second@market': [
            { scope: 'project', projectPath: secondProject, installPath: secondPlugin },
          ],
        },
      }),
    )
    await fs.writeFile(
      join(firstProject, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'first@market': false } }),
    )
    await fs.writeFile(
      join(secondProject, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'first@market': true } }),
    )

    const roots = await discoverOmpSupplementalRoots(home, [firstProject, secondProject], {})

    expect(
      roots.some(
        (root) => root.path === join(firstPlugin, 'skills') && root.projectRoot === firstProject,
      ),
    ).toBe(false)
    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(firstPlugin, 'skills'),
          projectRoot: secondProject,
        }),
        expect.objectContaining({
          path: join(secondPlugin, 'skills'),
          projectRoot: secondProject,
        }),
      ]),
    )
  })

  it('discovers OMP plugins from XDG_DATA_HOME', async () => {
    const home = await tempHome()
    const xdgDataHome = join(home, 'xdg-data')
    const pluginsRoot = join(xdgDataHome, 'omp', 'plugins')
    const pluginRoot = join(pluginsRoot, 'node_modules', 'xdg-plugin')
    await fs.mkdir(pluginRoot, { recursive: true })
    await fs.writeFile(
      join(pluginsRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'xdg-plugin': '1.0.0' } }),
    )
    await fs.writeFile(join(pluginRoot, 'package.json'), JSON.stringify({ omp: {} }))

    const roots = await discoverOmpSupplementalRoots(
      home,
      [],
      { XDG_DATA_HOME: xdgDataHome },
      'linux',
    )

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(pluginRoot, 'skills'), origin: 'plugin' }),
      ]),
    )
  })

  it('keeps OMP plugins in the config root until XDG is initialized', async () => {
    const home = await tempHome()
    const xdgDataHome = join(home, 'xdg-data')
    const pluginsRoot = join(home, '.omp', 'plugins')
    const pluginRoot = join(pluginsRoot, 'node_modules', 'native-plugin')
    await fs.mkdir(pluginRoot, { recursive: true })
    await fs.writeFile(
      join(pluginsRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'native-plugin': '1.0.0' } }),
    )
    await fs.writeFile(join(pluginRoot, 'package.json'), JSON.stringify({ omp: {} }))

    const roots = await discoverOmpSupplementalRoots(
      home,
      [],
      { XDG_DATA_HOME: xdgDataHome },
      'linux',
    )

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(pluginRoot, 'skills'), origin: 'plugin' }),
      ]),
    )
  })

  it('uses the profile-specific XDG root only after that OMP profile is initialized', async () => {
    const home = await tempHome()
    const xdgDataHome = join(home, 'xdg-data')
    const configPluginsRoot = join(home, '.omp', 'profiles', 'work', 'plugins')
    const configPlugin = join(configPluginsRoot, 'node_modules', 'config-plugin')
    const xdgProfileRoot = join(xdgDataHome, 'omp', 'profiles', 'work')
    const xdgPluginsRoot = join(xdgProfileRoot, 'plugins')
    const xdgPlugin = join(xdgPluginsRoot, 'node_modules', 'xdg-plugin')
    await Promise.all([
      fs.mkdir(configPlugin, { recursive: true }),
      fs.mkdir(xdgPlugin, { recursive: true }),
    ])
    await fs.writeFile(
      join(configPluginsRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'config-plugin': '1.0.0' } }),
    )
    await fs.writeFile(join(configPlugin, 'package.json'), JSON.stringify({ omp: {} }))
    await fs.writeFile(
      join(xdgPluginsRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'xdg-plugin': '1.0.0' } }),
    )
    await fs.writeFile(join(xdgPlugin, 'package.json'), JSON.stringify({ omp: {} }))

    await fs.rm(xdgProfileRoot, { recursive: true, force: true })
    const beforeInitialization = await discoverOmpSupplementalRoots(
      home,
      [],
      { OMP_PROFILE: 'work', XDG_DATA_HOME: xdgDataHome },
      'linux',
    )
    expect(beforeInitialization).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(configPlugin, 'skills'), origin: 'plugin' }),
      ]),
    )

    await fs.mkdir(xdgPlugin, { recursive: true })
    await fs.writeFile(
      join(xdgPluginsRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'xdg-plugin': '1.0.0' } }),
    )
    await fs.writeFile(join(xdgPlugin, 'package.json'), JSON.stringify({ omp: {} }))
    const afterInitialization = await discoverOmpSupplementalRoots(
      home,
      [],
      { OMP_PROFILE: 'work', XDG_DATA_HOME: xdgDataHome },
      'linux',
    )
    expect(afterInitialization).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(xdgPlugin, 'skills'), origin: 'plugin' }),
      ]),
    )
    expect(afterInitialization.some((root) => root.path === join(configPlugin, 'skills'))).toBe(false)
  })

  it('only discovers enabled OMP plugin packages', async () => {
    const home = await tempHome()
    const pluginsRoot = join(home, '.omp', 'plugins')
    const enabledRoot = join(pluginsRoot, 'node_modules', 'enabled-plugin')
    const disabledRoot = join(pluginsRoot, 'node_modules', 'disabled-plugin')
    await fs.mkdir(enabledRoot, { recursive: true })
    await fs.mkdir(disabledRoot, { recursive: true })
    await fs.writeFile(
      join(pluginsRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'enabled-plugin': '1.0.0', 'disabled-plugin': '1.0.0' } }),
    )
    await fs.writeFile(
      join(pluginsRoot, 'omp-plugins.lock.json'),
      JSON.stringify({ plugins: { 'disabled-plugin': { enabled: false } } }),
    )
    await fs.writeFile(join(enabledRoot, 'package.json'), JSON.stringify({ omp: {} }))
    await fs.writeFile(join(disabledRoot, 'package.json'), JSON.stringify({ omp: {} }))

    const roots = await discoverOmpSupplementalRoots(home, [], {})

    expect(roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: join(enabledRoot, 'skills'), origin: 'plugin' }),
      ]),
    )
    expect(roots.some((root) => root.path === join(disabledRoot, 'skills'))).toBe(false)
  })

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

describe('scanInstalledSkills', () => {
  it('保留调用方传入的未注册平台根', async () => {
    const home = await tempHome()
    const root = join(home, 'custom-skills')
    await fs.mkdir(join(root, 'custom-skill'), { recursive: true })
    await fs.writeFile(
      join(root, 'custom-skill', 'SKILL.md'),
      '---\nname: custom-skill\ndescription: test\n---\n',
    )
    const roots: SkillRoot[] = [
      {
        agent: 'custom-agent',
        scope: 'user',
        path: root,
        origin: 'user',
        readOnly: false,
      },
    ]

    expect(await scanInstalledSkills([], roots)).toEqual([
      expect.objectContaining({ agent: 'custom-agent', path: join(root, 'custom-skill') }),
    ])
  })

  it('单个损坏的 Skill 不阻断同一根目录下的其他 Skill，并被标记为解析失败', async () => {
    const home = await tempHome()
    const root = join(home, 'custom-skills')
    await fs.mkdir(join(root, 'broken'), { recursive: true })
    await fs.mkdir(join(root, 'healthy'), { recursive: true })
    await fs.writeFile(
      join(root, 'broken', 'SKILL.md'),
      '---\nname: broken\ndescription: invalid: yaml\n---\n',
      'utf8',
    )
    await fs.writeFile(
      join(root, 'healthy', 'SKILL.md'),
      '---\nname: healthy\ndescription: ok\n---\n',
      'utf8',
    )
    const roots: SkillRoot[] = [
      { agent: 'custom-agent', scope: 'user', path: root, origin: 'user', readOnly: false },
    ]

    const skills = await scanInstalledSkills([], roots)
    // 损坏的 Skill 不再被静默丢弃，而是带上 parseError 一并返回，
    // 这样界面能提示用户去修文件；健康的 Skill 不受影响。
    expect(skills).toHaveLength(2)
    const healthy = skills.find((item) => item.path === join(root, 'healthy'))
    const broken = skills.find((item) => item.path === join(root, 'broken'))
    expect(healthy?.parseError).toBeUndefined()
    expect(healthy?.skill.description).toBe('ok')
    expect(broken?.parseError).toEqual(
      expect.objectContaining({ path: join(root, 'broken', 'SKILL.md') }),
    )
  })
})

describe('discoverLingxiSupplementalRoots', () => {
  it.each([
    ['darwin', ['Library', 'Application Support', 'WPS 灵犀']],
    ['win32', ['AppData', 'Roaming', 'WPS 灵犀']],
    ['linux', ['.config', 'WPS 灵犀']],
  ] as const)('points at the bundled official_skills dir on %s', (os, segments) => {
    expect(discoverLingxiSupplementalRoots('/home/test', os)).toEqual([
      {
        agent: 'wps-lingxi',
        scope: 'user',
        path: join('/home/test', ...segments, 'serverdir', 'official_skills'),
        origin: 'system',
        readOnly: true,
        canToggle: false,
      },
    ])
  })
})
