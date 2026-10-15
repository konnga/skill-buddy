import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatformMcpAdapter } from './adapters/platform-adapter.js'
import { INITIAL_MCP_PROFILES } from './catalog.js'
import { scanMcpServers } from './scanner.js'
import { comparePlatformDisplayName } from '../platforms.js'

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

  it('平台列表按显示名排序，同一平台的接入面保持相邻', async () => {
    const home = await mkdtemp(join(tmpdir(), 'skillbuddy-mcp-order-'))
    temporaryDirectories.push(home)
    const adapters = INITIAL_MCP_PROFILES.map((entry) => new PlatformMcpAdapter(entry, home))

    const { platforms } = await scanMcpServers([], adapters, {})
    const names = platforms.map((platform) => platform.displayName)

    expect(names).toEqual([...names].sort(comparePlatformDisplayName))
    // 声明顺序本身不是字母序，否则上面这条断言抓不到「忘了排序」。
    expect(names).not.toEqual(INITIAL_MCP_PROFILES.map((entry) => entry.displayName))

    for (const agent of new Set(platforms.map((platform) => platform.agent))) {
      const positions = platforms
        .map((platform, index) => (platform.agent === agent ? index : -1))
        .filter((index) => index >= 0)
      expect(positions).toEqual(positions.map((_, offset) => positions[0]! + offset))
    }
  })
})
