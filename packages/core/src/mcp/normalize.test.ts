import { describe, expect, it } from 'vitest'
import { hashMcpDefinition, normalizeNativeMcpServer } from './normalize.js'

describe('normalizeNativeMcpServer', () => {
  it('redacts literal environment values and sensitive arguments', () => {
    const result = normalizeNativeMcpServer(
      'github',
      {
        command: 'npx',
        args: ['server', '--token', 'plain-argument-token', '--api-key=plain-key'],
        env: {
          GITHUB_TOKEN: 'plain-environment-token',
          DATABASE_URL: '${DATABASE_URL}',
        },
      },
      'standard',
      {},
    )
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('plain-argument-token')
    expect(serialized).not.toContain('plain-environment-token')
    expect(serialized).not.toContain('plain-key')
    expect(result.definition.transport).toMatchObject({
      kind: 'stdio',
      args: ['server', '--token', '[redacted]', '--api-key=[redacted]'],
      env: {
        GITHUB_TOKEN: { kind: 'secret', key: 'GITHUB_TOKEN', state: 'configured' },
        DATABASE_URL: { kind: 'env', name: 'DATABASE_URL' },
      },
    })
    expect(result.authState).toBe('missing-secrets')
  })

  it('redacts remote headers, URL query values and credentials', () => {
    const result = normalizeNativeMcpServer(
      'remote',
      {
        url: 'https://user:pass@example.invalid/mcp?token=url-token&tenant=acme#fragment',
        headers: {
          Authorization: 'Bearer header-token',
        },
      },
      'standard',
    )
    const serialized = JSON.stringify(result)

    for (const secret of ['user', 'pass', 'url-token', 'acme', 'header-token', 'fragment']) {
      expect(serialized).not.toContain(secret)
    }
    expect(result.definition.requiredSecrets).toEqual([
      'Authorization',
      'URL_CREDENTIALS',
      'URL_QUERY_TENANT',
      'URL_QUERY_TOKEN',
    ])
  })

  it('normalizes OpenCode command arrays and native enabled state', () => {
    const result = normalizeNativeMcpServer(
      'local',
      {
        type: 'local',
        command: ['pnpm', 'dlx', '@example/server'],
        environment: { TOKEN: '{env:TOKEN}' },
        enabled: false,
      },
      'opencode',
      { TOKEN: 'configured-outside-the-result' },
    )

    expect(result.definition.transport).toMatchObject({
      kind: 'stdio',
      command: 'pnpm',
      args: ['dlx', '@example/server'],
      env: { TOKEN: { kind: 'env', name: 'TOKEN' } },
    })
    expect(result.enabled).toBe(false)
    expect(result.authState).toBe('ready')
  })

  it('keeps definition hashes independent from local secret state', () => {
    const configured = normalizeNativeMcpServer(
      'server',
      { command: 'node', env: { TOKEN: '${TOKEN}' } },
      'standard',
      { TOKEN: 'present' },
    )
    const missing = normalizeNativeMcpServer(
      'server',
      { command: 'node', env: { TOKEN: '${TOKEN}' } },
      'standard',
      {},
    )

    expect(hashMcpDefinition(configured.definition)).toBe(hashMcpDefinition(missing.definition))
  })
})
