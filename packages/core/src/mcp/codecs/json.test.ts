import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { JsonMcpConfigCodec } from './json.js'
import { McpConfigCodecError } from './types.js'

const fixture = (name: string): Promise<string> =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('JsonMcpConfigCodec', () => {
  it('adds a Claude Code server without changing unrelated JSON', async () => {
    const source = await fixture('claude-code.mcp.json')
    const codec = new JsonMcpConfigCodec('json')
    const output = codec.upsertServer(source, ['mcpServers'], 'docs', {
      type: 'http',
      url: 'https://example.invalid/mcp',
    })

    expect(codec.readServers(output, ['mcpServers']).docs).toEqual({
      type: 'http',
      url: 'https://example.invalid/mcp',
    })
    expect(output).toContain('@modelcontextprotocol/server-filesystem')
  })

  it('preserves JSONC comments, trailing commas and unrelated settings', async () => {
    const source = await fixture('opencode.jsonc')
    const codec = new JsonMcpConfigCodec('jsonc')
    const output = codec.upsertServer(source, ['mcp'], 'remote-docs', {
      type: 'remote',
      url: 'https://example.invalid/mcp',
      enabled: true,
    })

    expect(output).toContain('// OpenCode 的其他设置不能被 MCP 编辑重写。')
    expect(output).toContain('"bash": "ask"')
    expect(output).toContain('"enabled": true\n    },')
    expect(output.endsWith(source.slice(source.indexOf('  "permissions"')))).toBe(true)
    expect(codec.readServers(output, ['mcp'])['remote-docs']).toEqual({
      type: 'remote',
      url: 'https://example.invalid/mcp',
      enabled: true,
    })
  })

  it('preserves comments inside an updated JSONC server', async () => {
    const source = await fixture('opencode.jsonc')
    const codec = new JsonMcpConfigCodec('jsonc')
    const output = codec.upsertServer(source, ['mcp'], 'local-tools', {
      type: 'local',
      command: ['pnpm', 'dlx', '@example/local-tools'],
      enabled: false,
    })

    expect(output).toContain('// 保留 Server 内部注释')
    expect(codec.readServers(output, ['mcp'])['local-tools']).toMatchObject({
      command: ['pnpm', 'dlx', '@example/local-tools'],
      enabled: false,
    })
  })

  it('removes only the requested server', async () => {
    const source = await fixture('cursor.mcp.json')
    const codec = new JsonMcpConfigCodec('json')
    const output = codec.removeServer(source, ['mcpServers'], 'docs')

    expect(codec.readServers(output, ['mcpServers'])).toEqual({})
    expect(output).toContain('"skillBuddyFixture"')
    expect(output).toContain('"preserve": true')
  })

  it('rejects comments in strict JSON and malformed JSONC', () => {
    expect(() => new JsonMcpConfigCodec('json').parse('{ // no\n }')).toThrow(
      McpConfigCodecError,
    )
    expect(() => new JsonMcpConfigCodec('jsonc').parse('{ "mcp": ')).toThrow(
      McpConfigCodecError,
    )
  })

  it('creates a valid config from an empty file', () => {
    const codec = new JsonMcpConfigCodec('jsonc')
    const output = codec.upsertServer('', ['mcp'], 'local', {
      type: 'local',
      command: ['node', 'server.js'],
    })

    expect(codec.readServers(output, ['mcp']).local).toEqual({
      type: 'local',
      command: ['node', 'server.js'],
    })
  })
})
