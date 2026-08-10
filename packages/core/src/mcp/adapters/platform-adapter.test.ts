import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { INITIAL_MCP_PROFILES } from '../catalog.js'
import { PlatformMcpAdapter } from './platform-adapter.js'

const temporaryDirectories: string[] = []

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'skillbuddy-mcp-'))
  temporaryDirectories.push(home)
  return home
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

const profile = (agent: string) => {
  const found = INITIAL_MCP_PROFILES.find((candidate) => candidate.agent === agent)
  if (!found) throw new Error(`missing profile: ${agent}`)
  return found
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('PlatformMcpAdapter', () => {
  it('discovers Claude Code user, project and local sources independently', async () => {
    const home = await temporaryHome()
    const projectRoot = join(home, 'projects', 'demo')
    const adapter = new PlatformMcpAdapter(profile('claude-code'), home)
    await write(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: { user: { command: 'node', args: ['user.js'] } },
        projects: {
          [projectRoot]: { mcpServers: { local: { command: 'node', args: ['local.js'] } } },
        },
      }),
    )
    await write(
      join(projectRoot, '.mcp.json'),
      JSON.stringify({ mcpServers: { project: { command: 'node', args: ['project.js'] } } }),
    )

    const sources = await adapter.configSources([projectRoot])
    const installations = (
      await Promise.all(sources.filter((source) => source.exists).map((source) => adapter.read(source)))
    ).flat()

    expect(sources.map((source) => source.scope)).toEqual(['user', 'project', 'local'])
    expect(installations.map((item) => `${item.definition.name}:${item.source.scope}`).sort()).toEqual(
      ['local:local', 'project:project', 'user:user'],
    )
  })

  it('reads Codex nested TOML without exposing literal secrets', async () => {
    const home = await temporaryHome()
    const adapter = new PlatformMcpAdapter(profile('codex'), home)
    const sourcePath = join(home, '.codex', 'config.toml')
    const fixture = await readFile(
      new URL('../codecs/fixtures/codex.config.toml', import.meta.url),
      'utf8',
    )
    await write(sourcePath, fixture.replace('${FIXTURE_TOKEN}', 'literal-secret-value'))

    const source = (await adapter.configSources()).find(
      (candidate) => candidate.configPath === sourcePath,
    )!
    const installations = await adapter.read(source)
    const serialized = JSON.stringify(installations)

    expect(installations).toHaveLength(1)
    expect(installations[0]?.definition.transport).toMatchObject({
      kind: 'stdio',
      command: 'npx',
    })
    expect(serialized).not.toContain('literal-secret-value')
    expect(installations[0]?.definition.requiredSecrets).toContain('FIXTURE_TOKEN')
  })

  it('reads Cursor standard JSON and OpenCode command arrays', async () => {
    const home = await temporaryHome()
    const cursor = new PlatformMcpAdapter(profile('cursor'), home)
    const opencode = new PlatformMcpAdapter(profile('opencode'), home)
    await write(
      join(home, '.cursor', 'mcp.json'),
      await readFile(new URL('../codecs/fixtures/cursor.mcp.json', import.meta.url), 'utf8'),
    )
    await write(
      join(home, '.config', 'opencode', 'opencode.json'),
      await readFile(new URL('../codecs/fixtures/opencode.jsonc', import.meta.url), 'utf8'),
    )

    const cursorSource = (await cursor.configSources()).find((source) => source.exists)!
    const opencodeSource = (await opencode.configSources()).find((source) => source.exists)!
    const [cursorInstallations, opencodeInstallations] = await Promise.all([
      cursor.read(cursorSource),
      opencode.read(opencodeSource),
    ])

    expect(cursorInstallations[0]?.definition.transport).toMatchObject({
      kind: 'streamable-http',
      url: 'https://example.invalid/mcp',
    })
    expect(opencodeInstallations[0]?.definition.transport).toMatchObject({
      kind: 'stdio',
      command: 'npx',
      args: ['-y', '@example/local-tools'],
    })
    expect(opencodeInstallations[0]?.enabled).toBe(true)
  })

  it('prepares Codex upsert, toggle and remove while retaining extension fields', async () => {
    const home = await temporaryHome()
    const adapter = new PlatformMcpAdapter(profile('codex'), home)
    const sourcePath = join(home, '.codex', 'config.toml')
    await write(
      sourcePath,
      '[mcp_servers.database]\ncommand = "node"\nargs = ["old.js"]\ntool_timeout_sec = 45\n',
    )
    const target = { agent: 'codex', surface: 'cli', scope: 'user' } as const
    const prepared = await adapter.prepareUpsert(
      {
        name: 'database',
        transport: {
          kind: 'stdio',
          command: 'node',
          args: ['new.js'],
          env: { DATABASE_URL: { kind: 'env', name: 'DATABASE_URL' } },
        },
        requiredSecrets: ['DATABASE_URL'],
      },
      target,
    )

    expect(prepared.afterText).toContain('args = ["new.js"]')
    expect(prepared.afterText).toContain('env_vars = ["DATABASE_URL"]')
    expect(prepared.afterText).toContain('tool_timeout_sec = 45')

    const toggle = await adapter.prepareToggle('database', false, target)
    expect(toggle.afterText).toContain('enabled = false')

    const remove = await adapter.prepareRemove('database', target)
    expect(remove.afterText).not.toContain('[mcp_servers.database]')
  })
})
