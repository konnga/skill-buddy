import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from '../platforms.js'
import { PlatformMcpAdapter } from './adapters/platform-adapter.js'
import { defaultMcpProfiles, type McpPlatformProfile } from './catalog.js'
import type { McpConfigSource } from './types.js'

const fixtureRoot = fileURLToPath(new URL('./codecs/fixtures/', import.meta.url))
const temporaryRoots: string[] = []

function profile(agent: string, surface: string): McpPlatformProfile {
  const found = defaultMcpProfiles().find(
    (candidate) => candidate.agent === agent && candidate.surface === surface,
  )
  if (!found) throw new Error(`missing profile ${agent}:${surface}`)
  return found
}

async function fixtureSource(
  agent: string,
  surface: string,
  fixture: string,
  nodePath: string[],
  format: 'json' | 'jsonc' = 'json',
): Promise<McpConfigSource> {
  const path = join(fixtureRoot, fixture)
  return {
    id: `${agent}:${surface}:${fixture}`,
    agent,
    surface,
    scope: 'user',
    configPath: path,
    format,
    nodePath,
    origin: 'user',
    readOnly: false,
    exists: true,
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('MCP 平台目录', () => {
  it('注册所有目标平台 surface，并明确排除豆包', () => {
    const keys = defaultMcpProfiles().map((item) => `${item.agent}:${item.surface}`)
    expect(keys).toEqual(
      expect.arrayContaining([
        'codebuddy:cli',
        'trae:editor',
        'trae-cn:editor',
        'kimi:cli',
        'zcode:native',
        'zcode:agents-compat',
        'workbuddy:desktop',
        'workbuddy:connector',
        'workbuddy-ai:desktop',
        'workbuddy-ai:connector',
        'gemini-cli:cli',
        'copilot:cli',
        'copilot:vscode',
        'copilot:cloud',
        'google-antigravity:ide',
      ]),
    )
    expect(keys.some((key) => key.startsWith('doubao:'))).toBe(false)
  })

  it('接入面顺序与内置平台顺序一致，同一平台的接入面相邻', () => {
    const profiles = defaultMcpProfiles()
    const agentOrder = [...new Set(profiles.map((profile) => profile.agent))]
    // 技能侧（侧边栏、PlatformTargetPicker）展示的是 BUILTIN_PLATFORMS 顺序，
    // MCP 安装目标列表走的是这份 profile 顺序，两者不一致时同一个平台会出现在不同位置。
    const expected = BUILTIN_PLATFORMS.map((platform) => platform.id).filter((id) =>
      agentOrder.includes(id),
    )
    expect(agentOrder).toEqual(expected)

    for (const agent of agentOrder) {
      const positions = profiles.reduce<number[]>(
        (acc, profile, index) => (profile.agent === agent ? [...acc, index] : acc),
        [],
      )
      const first = positions[0]
      expect(positions).toEqual(positions.map((_, offset) => first + offset))
    }
  })

  it('Antigravity 的 MCP 配置只落在全局文件', async () => {
    const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-antigravity-'))
    temporaryRoots.push(home)
    const projectRoot = join(home, 'project')
    await fs.mkdir(projectRoot)

    const adapter = new PlatformMcpAdapter(profile('google-antigravity', 'ide'), home)
    const sources = await adapter.configSources([projectRoot])

    // 工作区根目录下并没有 mcp_config.json：MCP 只在全局 `~/.gemini/config/`
    // 与插件目录 `plugins/<name>/` 里。没有插件时，插件来源展开为空。
    expect(sources.map((source) => source.configPath)).toEqual([
      join(home, '.gemini', 'config', 'mcp_config.json'),
    ])
    expect(sources.some((source) => source.scope === 'project')).toBe(false)
    // 只声明 user：插件来源只读，声明 project 会给用户一个写不了的目标。
    expect(profile('google-antigravity', 'ide').capabilities.scopes).toEqual(['user'])
  })

  it('以只读来源发现 Antigravity 插件内的 MCP 配置', async () => {
    const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-antigravity-plugin-'))
    temporaryRoots.push(home)
    const projectRoot = join(home, 'project')
    const globalPlugin = join(
      home,
      '.gemini',
      'config',
      'plugins',
      'global-kit',
      'mcp_config.json',
    )
    // 工作区插件故意用非默认前缀 `.agent/`，验证四种拼写都参与展开。
    const projectPlugin = join(projectRoot, '.agent', 'plugins', 'team-kit', 'mcp_config.json')
    await fs.mkdir(dirname(globalPlugin), { recursive: true })
    await fs.writeFile(
      globalPlugin,
      JSON.stringify({
        mcpServers: { globalPlugin: { command: 'node', args: ['global.js'] } },
      }),
    )
    await fs.mkdir(dirname(projectPlugin), { recursive: true })
    await fs.writeFile(
      projectPlugin,
      JSON.stringify({
        mcpServers: { teamPlugin: { serverUrl: 'https://mcp.example.com/sse' } },
      }),
    )

    const adapter = new PlatformMcpAdapter(profile('google-antigravity', 'ide'), home)
    const sources = (await adapter.configSources([projectRoot])).filter((source) => source.exists)

    expect(sources.map((source) => source.configPath).sort()).toEqual(
      [globalPlugin, projectPlugin].sort(),
    )
    expect(sources.every((source) => source.readOnly)).toBe(true)

    const installations = (
      await Promise.all(sources.map((source) => adapter.read(source)))
    ).flat()
    expect(installations.map((item) => item.definition.name).sort()).toEqual([
      'globalPlugin',
      'teamPlugin',
    ])
    // 插件里的远端服务器同样按 antigravity schema 还原成 sse。
    expect(installations.find((item) => item.definition.name === 'teamPlugin')?.definition.transport)
      .toMatchObject({ kind: 'sse', url: 'https://mcp.example.com/sse' })
  })

  it('拒绝写入 Antigravity 插件内的 MCP 配置', async () => {
    const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-antigravity-readonly-'))
    temporaryRoots.push(home)
    const projectRoot = join(home, 'project')
    const pluginConfig = join(projectRoot, '.agents', 'plugins', 'team-kit', 'mcp_config.json')
    await fs.mkdir(dirname(pluginConfig), { recursive: true })
    await fs.writeFile(
      pluginConfig,
      JSON.stringify({ mcpServers: { teamPlugin: { command: 'node', args: ['team.js'] } } }),
    )

    const adapter = new PlatformMcpAdapter(profile('google-antigravity', 'ide'), home)
    const installation = (
      await Promise.all(
        (await adapter.configSources([projectRoot]))
          .filter((source) => source.exists)
          .map((source) => adapter.read(source)),
      )
    )
      .flat()
      .find((item) => item.definition.name === 'teamPlugin')

    expect(installation?.source.readOnly).toBe(true)
    await expect(adapter.prepareSetSecret(installation!, 'TOKEN', 'secret-value')).rejects.toThrow(
      '只读',
    )
    // 全局配置仍可写，插件来源不会把写入目标顶掉。
    await expect(
      adapter.prepareUpsert(
        {
          name: 'local',
          transport: { kind: 'stdio', command: 'node', args: ['local.js'], env: {} },
          requiredSecrets: [],
        },
        { agent: 'google-antigravity', surface: 'ide', scope: 'user' },
      ),
    ).resolves.toMatchObject({ kind: 'upsert' })
  })

  it('按官方优先级选择 CodeBuddy 兼容配置文件', async () => {
    const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-codebuddy-'))
    temporaryRoots.push(home)
    const projectRoot = join(home, 'project')
    await fs.mkdir(join(home, '.codebuddy'), { recursive: true })
    await fs.mkdir(projectRoot)
    await fs.writeFile(join(home, '.codebuddy', 'mcp.json'), '{"mcpServers":{}}')
    await fs.writeFile(join(projectRoot, 'mcp.json'), '{"mcpServers":{}}')

    const adapter = new PlatformMcpAdapter(profile('codebuddy', 'cli'), home)
    const sources = await adapter.configSources([projectRoot])
    expect(sources.find((source) => source.scope === 'user')?.configPath).toBe(
      join(home, '.codebuddy', 'mcp.json'),
    )
    expect(sources.find((source) => source.scope === 'project')?.configPath).toBe(
      join(projectRoot, 'mcp.json'),
    )
    expect(sources.find((source) => source.scope === 'local')?.nodePath).toEqual([
      'projects',
      resolve(projectRoot),
      'mcpServers',
    ])
  })

  it.each(['workbuddy', 'workbuddy-ai'] as const)(
    '%s 只选择本版的首个已存在 MCP 配置，缺省时新建 .mcp.json',
    async (agent) => {
      const home = await fs.mkdtemp(join(tmpdir(), `skillbuddy-${agent}-priority-`))
      temporaryRoots.push(home)
      const adapter = new PlatformMcpAdapter(profile(agent, 'desktop'), home)
      const directory = join(home, `.${agent}`)
      const primary = join(directory, '.mcp.json')
      const backup = join(directory, 'mcp.json')
      const [initial] = await adapter.configSources()
      expect(initial?.configPath).toBe(primary)
      expect(initial?.exists).toBe(false)
      expect(await adapter.detect()).toBe(false)

      await fs.mkdir(directory)
      await fs.writeFile(backup, '{"keep":true,"mcpServers":{}}')
      const [fallback] = await adapter.configSources()
      expect(fallback?.configPath).toBe(backup)
      expect(fallback?.exists).toBe(true)
      const mutation = await adapter.prepareUpsert(
        {
          name: 'remote',
          transport: { kind: 'streamable-http', url: 'https://example.com/mcp', headers: {} },
          requiredSecrets: [],
        },
        { agent, surface: 'desktop', scope: 'user' },
      )
      expect(mutation.source.configPath).toBe(backup)
      expect(JSON.parse(mutation.afterText).keep).toBe(true)

      await fs.writeFile(primary, '{"mcpServers":{}}')
      const sources = await adapter.configSources()
      expect(sources).toHaveLength(1)
      expect(sources[0]?.configPath).toBe(primary)
    },
  )

  it('国际版 MCP 读写不落到国内版或共享的 CodeBuddy 兼容文件', async () => {
    const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-workbuddy-isolation-'))
    temporaryRoots.push(home)
    const domestic = new PlatformMcpAdapter(profile('workbuddy', 'desktop'), home)
    const international = new PlatformMcpAdapter(profile('workbuddy-ai', 'desktop'), home)
    const legacyPath = join(home, '.codebuddy.json')
    const legacyText = '{"mcpServers":{"legacy":{"command":"node","args":["legacy.js"]}}}'
    await fs.writeFile(legacyPath, legacyText)
    expect(await domestic.detect()).toBe(false)
    expect(await international.detect()).toBe(false)

    const domesticPath = join(home, '.workbuddy', '.mcp.json')
    const domesticText = '{"mcpServers":{"domestic":{"command":"node","args":["domestic.js"]}}}'
    await fs.mkdir(dirname(domesticPath))
    await fs.writeFile(domesticPath, domesticText)
    expect(await domestic.detect()).toBe(true)
    expect(await international.detect()).toBe(false)

    const mutation = await international.prepareUpsert(
      {
        name: 'international',
        transport: { kind: 'stdio', command: 'node', args: ['international.js'], env: {} },
        requiredSecrets: [],
      },
      { agent: 'workbuddy-ai', surface: 'desktop', scope: 'user' },
    )
    expect(mutation.source.configPath).toBe(join(home, '.workbuddy-ai', '.mcp.json'))
    await fs.mkdir(dirname(mutation.source.configPath))
    await fs.writeFile(mutation.source.configPath, mutation.afterText)

    for (const [adapter, name] of [
      [domestic, 'domestic'],
      [international, 'international'],
    ] as const) {
      const [source] = await adapter.configSources()
      if (!source) throw new Error('missing MCP source')
      const installations = await adapter.read(source, {})
      expect(installations.map((installation) => installation.definition.name)).toEqual([name])
    }
    expect(await fs.readFile(domesticPath, 'utf8')).toBe(domesticText)
    expect(await fs.readFile(legacyPath, 'utf8')).toBe(legacyText)
  })

  it('将 Cloud、Connector 和待验收兼容层标记为只读', () => {
    for (const key of [
      ['copilot', 'cloud'],
      ['workbuddy', 'connector'],
      ['workbuddy-ai', 'connector'],
      ['zcode', 'native'],
      ['zcode', 'agents-compat'],
    ] as const) {
      expect(profile(key[0], key[1]).capabilities.management).toBe('read-only')
    }
    expect(profile('workbuddy', 'desktop').capabilities.management).toBe('read-write')
    expect(profile('workbuddy-ai', 'desktop').capabilities.management).toBe('read-write')
  })

  it.each([
    ['codebuddy', 'cli', 'codebuddy.mcp.jsonc', ['mcpServers'], 'jsonc', 'filesystem'],
    ['trae', 'editor', 'trae.mcp.json', ['mcpServers'], 'json', 'search'],
    ['kimi', 'cli', 'kimi.mcp.json', ['mcpServers'], 'json', 'database'],
    ['zcode', 'native', 'zcode.settings.json', ['mcp', 'servers'], 'json', 'docs'],
    ['workbuddy', 'desktop', 'workbuddy.mcp.json', ['mcpServers'], 'json', 'calendar'],
    ['workbuddy-ai', 'desktop', 'workbuddy.mcp.json', ['mcpServers'], 'json', 'calendar'],
    ['gemini-cli', 'cli', 'gemini.settings.json', ['mcpServers'], 'json', 'github'],
    ['copilot', 'cli', 'copilot-cli.mcp.json', ['mcpServers'], 'json', 'issues'],
    ['copilot', 'vscode', 'vscode.mcp.json', ['servers'], 'json', 'fetch'],
  ] as const)(
    '读取并脱敏 %s:%s Fixture',
    async (agent, surface, fixture, nodePath, format, name) => {
      const adapter = new PlatformMcpAdapter(profile(agent, surface), fixtureRoot)
      const source = await fixtureSource(agent, surface, fixture, [...nodePath], format)
      const installations = await adapter.read(source, {})
      expect(installations.map((installation) => installation.definition.name)).toContain(name)
      expect(JSON.stringify(installations)).not.toContain('plain-secret-value')
    },
  )

  it('Gemini 与 VS Code 的项目配置写入只修改对应节点', async () => {
    for (const [agent, surface, relativePath, nodePath] of [
      ['gemini-cli', 'cli', '.gemini/settings.json', 'mcpServers'],
      ['copilot', 'vscode', '.vscode/mcp.json', 'servers'],
    ] as const) {
      const home = await fs.mkdtemp(join(tmpdir(), `skillbuddy-${agent}-`))
      temporaryRoots.push(home)
      const projectRoot = join(home, 'project')
      const configPath = join(projectRoot, relativePath)
      await fs.mkdir(dirname(configPath), { recursive: true })
      await fs.writeFile(configPath, '{\n  "keep": true\n}\n')
      const adapter = new PlatformMcpAdapter(profile(agent, surface), home)
      const mutation = await adapter.prepareUpsert(
        {
          name: 'filesystem',
          transport: { kind: 'stdio', command: 'npx', args: ['server'], env: {} },
          requiredSecrets: [],
        },
        { agent, surface, scope: 'project', projectRoot },
      )
      expect(mutation.afterText).toContain(`"${nodePath}"`)
      expect(mutation.afterText).toContain('"keep": true')
    }
  })
})
