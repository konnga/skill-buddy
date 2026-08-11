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

  it('redacts remote headers, sensitive URL query values and credentials', () => {
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

    for (const secret of ['user', 'pass', 'url-token', 'header-token', 'fragment']) {
      expect(serialized).not.toContain(secret)
    }
    // 非敏感查询参数必须原样保留，否则会破坏 URL 并触发虚假漂移。
    expect(
      result.definition.transport.kind !== 'stdio' && result.definition.transport.url,
    ).toContain('tenant=acme')
    expect(result.definition.requiredSecrets).toEqual([
      'Authorization',
      'URL_CREDENTIALS',
      'URL_QUERY_TOKEN',
    ])
  })

  it('keeps benign flags, bare arguments, and boolean switches untouched', () => {
    const result = normalizeNativeMcpServer(
      'benign',
      {
        command: 'npx',
        args: ['-y', '@acme/token-mcp', '--no-token-cache', '--port', '3000'],
        env: {},
      },
      'standard',
      {},
    )

    expect(result.definition.transport).toMatchObject({
      kind: 'stdio',
      args: ['-y', '@acme/token-mcp', '--no-token-cache', '--port', '3000'],
    })
    expect(result.definition.requiredSecrets).toEqual([])
    expect(result.definition.metadata).toBeUndefined()
  })

  it('reads Codex env_vars back as env references', () => {
    const result = normalizeNativeMcpServer(
      'codex-server',
      {
        command: 'npx',
        args: ['server'],
        env_vars: ['DATABASE_URL'],
      },
      'codex',
      { DATABASE_URL: 'present' },
    )

    expect(result.definition.transport).toMatchObject({
      kind: 'stdio',
      env: { DATABASE_URL: { kind: 'env', name: 'DATABASE_URL' } },
    })
    expect(result.definition.requiredSecrets).toEqual(['DATABASE_URL'])
    expect(result.platformMetadata.extensionKeys).toEqual([])
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
