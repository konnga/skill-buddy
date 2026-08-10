import { describe, expect, it } from 'vitest'
import { aggregateMcpServers } from './aggregate.js'
import { hashMcpDefinition } from './normalize.js'
import type { McpInstallation, McpServerDefinition } from './types.js'

function installation(
  agent: string,
  definition: McpServerDefinition,
  enabled: boolean | null = true,
): McpInstallation {
  return {
    id: `${agent}:${definition.name}`,
    definition,
    source: {
      id: agent,
      agent,
      surface: 'test',
      scope: 'user',
      configPath: `/tmp/${agent}`,
      format: 'json',
      nodePath: ['mcpServers'],
      origin: 'user',
      readOnly: false,
      exists: true,
    },
    enabled,
    authState: 'ready',
    definitionHash: hashMcpDefinition(definition),
    sourceHash: agent,
  }
}

const stdio = (name: string, command = 'node'): McpServerDefinition => ({
  name,
  transport: { kind: 'stdio', command, args: [], env: {} },
  requiredSecrets: [],
})

describe('aggregateMcpServers', () => {
  it('separates definition drift from enabled-state drift', () => {
    const servers = aggregateMcpServers([
      installation('claude-code', stdio('shared'), true),
      installation('codex', stdio('shared'), false),
    ])

    expect(servers[0]).toMatchObject({
      name: 'shared',
      hasDefinitionDrift: false,
      hasStateDrift: true,
    })
  })

  it('classifies same-name command conflicts', () => {
    const servers = aggregateMcpServers([
      installation('claude-code', stdio('shared', 'node')),
      installation('codex', stdio('shared', 'python')),
    ])

    expect(servers[0]).toMatchObject({
      hasDefinitionDrift: true,
      conflictKind: 'command',
    })
  })
})
