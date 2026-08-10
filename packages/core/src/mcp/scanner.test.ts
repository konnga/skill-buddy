import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatformMcpAdapter } from './adapters/platform-adapter.js'
import { INITIAL_MCP_PROFILES } from './catalog.js'
import { scanMcpServers } from './scanner.js'

const temporaryDirectories: string[] = []

const profile = (agent: string) => {
  const found = INITIAL_MCP_PROFILES.find((candidate) => candidate.agent === agent)
  if (!found) throw new Error(`missing profile: ${agent}`)
  return found
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  )
})

describe('scanMcpServers', () => {
  it('keeps healthy platform results when another source is malformed', async () => {
    const home = await mkdtemp(join(tmpdir(), 'skillbuddy-mcp-scan-'))
    temporaryDirectories.push(home)
    await write(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { healthy: { command: 'node', args: ['server.js'] } } }),
    )
    await write(join(home, '.config', 'opencode', 'opencode.json'), '{ "mcp": ')

    const result = await scanMcpServers(
      [],
      [
        new PlatformMcpAdapter(profile('cursor'), home),
        new PlatformMcpAdapter(profile('opencode'), home),
      ],
      {},
    )

    expect(result.servers.map((server) => server.name)).toEqual(['healthy'])
    expect(result.platforms.every((platform) => platform.detected)).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('MCP_CONFIG_PARSE_FAILED')
  })
})
