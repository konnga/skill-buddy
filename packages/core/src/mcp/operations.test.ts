import { describe, expect, it } from 'vitest'
import { INITIAL_MCP_PROFILES } from './catalog.js'
import { projectMcpDefinition } from './operations.js'
import type { McpServerDefinition } from './types.js'

const profile = (agent: string) => {
  const found = INITIAL_MCP_PROFILES.find((candidate) => candidate.agent === agent)
  if (!found) throw new Error(`missing profile: ${agent}`)
  return found
}

const stdioDefinition: McpServerDefinition = {
  name: 'database',
  transport: {
    kind: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: {
      DATABASE_URL: { kind: 'env', name: 'DATABASE_URL' },
    },
  },
  requiredSecrets: ['DATABASE_URL'],
}

describe('projectMcpDefinition', () => {
  it('uses platform-native environment references', () => {
    const claude = projectMcpDefinition(
      stdioDefinition,
      { agent: 'claude-code', surface: 'cli', scope: 'user' },
      profile('claude-code'),
    )
    const opencode = projectMcpDefinition(
      stdioDefinition,
      { agent: 'opencode', surface: 'cli', scope: 'user' },
      profile('opencode'),
    )
    const codex = projectMcpDefinition(
      stdioDefinition,
      { agent: 'codex', surface: 'cli', scope: 'user' },
      profile('codex'),
    )

    expect(claude.nativeValue).toMatchObject({ env: { DATABASE_URL: '${DATABASE_URL}' } })
    expect(opencode.nativeValue).toMatchObject({
      environment: { DATABASE_URL: '{env:DATABASE_URL}' },
    })
    expect(codex.nativeValue).toMatchObject({ env_vars: ['DATABASE_URL'] })
  })

  it('blocks non-exportable secrets and unsupported transports', () => {
    const projection = projectMcpDefinition(
      {
        name: 'private',
        transport: {
          kind: 'websocket',
          url: 'wss://example.invalid/mcp',
          headers: {
            Authorization: { kind: 'secret', key: 'Authorization', state: 'configured' },
          },
        },
        requiredSecrets: ['Authorization'],
        metadata: { nonExportableFields: ['transport.url'] },
      },
      { agent: 'codex', surface: 'cli', scope: 'user' },
      profile('codex'),
    )

    expect(projection.blockers.map((issue) => issue.code)).toContain(
      'MCP_TRANSPORT_UNSUPPORTED',
    )
    expect(projection.blockers.map((issue) => issue.code)).toContain(
      'MCP_SECRET_NOT_EXPORTABLE',
    )
  })
})
