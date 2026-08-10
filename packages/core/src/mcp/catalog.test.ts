import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
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
        'gemini-cli:cli',
        'copilot:cli',
        'copilot:vscode',
        'copilot:cloud',
      ]),
    )
    expect(keys.some((key) => key.startsWith('doubao:'))).toBe(false)
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

  it('将 Cloud、Connector 和待验收兼容层标记为只读', () => {
    for (const key of [
      ['copilot', 'cloud'],
      ['workbuddy', 'connector'],
      ['zcode', 'native'],
      ['zcode', 'agents-compat'],
    ] as const) {
      expect(profile(key[0], key[1]).capabilities.management).toBe('read-only')
    }
    expect(profile('workbuddy', 'desktop').capabilities.management).toBe('read-write')
  })

  it.each([
    ['codebuddy', 'cli', 'codebuddy.mcp.jsonc', ['mcpServers'], 'jsonc', 'filesystem'],
    ['trae', 'editor', 'trae.mcp.json', ['mcpServers'], 'json', 'search'],
    ['kimi', 'cli', 'kimi.mcp.json', ['mcpServers'], 'json', 'database'],
    ['zcode', 'native', 'zcode.settings.json', ['mcp', 'servers'], 'json', 'docs'],
    ['workbuddy', 'desktop', 'workbuddy.mcp.json', ['mcpServers'], 'json', 'calendar'],
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
