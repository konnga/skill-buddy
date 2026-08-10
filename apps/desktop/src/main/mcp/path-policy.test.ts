import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpConfigSource, McpPreparedMutation } from '@skillbuddy/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { McpPathAccessPolicy } from './path-policy.js'

describe('McpPathAccessPolicy', () => {
  let root: string
  let source: McpConfigSource
  let mutation: McpPreparedMutation
  let policy: McpPathAccessPolicy

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-mcp-policy-'))
    source = {
      id: 'registered-source',
      agent: 'test-agent',
      surface: 'cli',
      scope: 'user',
      configPath: join(root, 'config.json'),
      format: 'json',
      nodePath: ['mcpServers'],
      origin: 'user',
      readOnly: false,
      exists: false,
    }
    mutation = {
      kind: 'upsert',
      name: 'filesystem',
      source,
      beforeHash: null,
      beforeText: '',
      afterText: '{"mcpServers":{}}',
      nativeValue: {},
    }
    policy = new McpPathAccessPolicy()
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('只允许 Adapter 扫描时登记的来源', async () => {
    policy.setSources([], [])
    await expect(policy.assertWritable(mutation)).rejects.toThrow('来源未获授权')

    policy.setSources([source], [])
    await expect(policy.assertWritable(mutation)).resolves.toBeUndefined()
  })

  it('拒绝 Renderer 复用来源 id 改写其他路径', async () => {
    policy.setSources([source], [])
    const forged = {
      ...mutation,
      source: { ...source, configPath: join(root, 'other.json') },
    }

    await expect(policy.assertWritable(forged)).rejects.toThrow('来源未获授权')
  })
})
