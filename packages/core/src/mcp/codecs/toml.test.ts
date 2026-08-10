import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { TomlMcpConfigCodec } from './toml.js'
import { McpConfigCodecError } from './types.js'

const fixture = (): Promise<string> =>
  readFile(new URL('./fixtures/codex.config.toml', import.meta.url), 'utf8')

describe('TomlMcpConfigCodec', () => {
  it('adds a sibling below an implicit mcp_servers table', async () => {
    const source = await fixture()
    const codec = new TomlMcpConfigCodec()
    const output = codec.upsertServer(source, ['mcp_servers'], 'docs', {
      url: 'https://example.invalid/mcp',
      enabled: true,
    })

    expect(codec.readServers(output, ['mcp_servers']).docs).toEqual({
      url: 'https://example.invalid/mcp',
      enabled: true,
    })
    expect(output).toContain('[mcp_servers.docs]')
    expect(output).not.toMatch(/^docs\s*=/m)
    expect(output.startsWith(source)).toBe(true)
  })

  it('updates one server while preserving comments and unrelated tables', async () => {
    const source = await fixture()
    const codec = new TomlMcpConfigCodec()
    const output = codec.upsertServer(source, ['mcp_servers'], 'filesystem', {
      command: 'pnpm',
      args: ['dlx', '@modelcontextprotocol/server-filesystem', '/tmp'],
      enabled: false,
      env: { FIXTURE_TOKEN: '${FIXTURE_TOKEN}' },
    })

    expect(output).toContain('command = "pnpm" # 保留行尾注释')
    expect(output.endsWith(source.slice(source.indexOf('[projects."/tmp/example"]')))).toBe(true)
    expect(output).toContain('# Codex 的非 MCP 设置必须逐字保留。')
    expect(codec.readServers(output, ['mcp_servers']).filesystem).toMatchObject({
      command: 'pnpm',
      enabled: false,
    })
  })

  it('removes only the requested server', async () => {
    const source = await fixture()
    const codec = new TomlMcpConfigCodec()
    const output = codec.removeServer(source, ['mcp_servers'], 'filesystem')

    expect(codec.readServers(output, ['mcp_servers'])).toEqual({})
    expect(output).toContain('[projects."/tmp/example"]')
    expect(output).toContain('approval_policy = "on-request"')
  })

  it('rejects malformed TOML', () => {
    const codec = new TomlMcpConfigCodec()
    expect(() => codec.parse('[mcp_servers.test\ncommand = "node"')).toThrow(
      McpConfigCodecError,
    )
  })

  it('rejects values TOML cannot represent', () => {
    const codec = new TomlMcpConfigCodec()
    expect(() =>
      codec.upsertServer('', ['mcp_servers'], 'invalid', {
        value: null,
      }),
    ).toThrow('must not contain null')
  })

  it('creates nested tables from an empty file', () => {
    const codec = new TomlMcpConfigCodec()
    const output = codec.upsertServer('', ['mcp_servers'], 'local', {
      command: 'node',
      args: ['server.js'],
      env: { TOKEN: '${TOKEN}' },
    })

    expect(output).toContain('[mcp_servers.local]')
    expect(output).toContain('[mcp_servers.local.env]')
    expect(codec.readServers(output, ['mcp_servers']).local).toMatchObject({
      command: 'node',
      env: { TOKEN: '${TOKEN}' },
    })
  })
})
