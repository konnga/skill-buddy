import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegistryClient, RegistryError } from './registry-client.js'
import type { McpServerDefinition } from './mcp/types.js'

const definition: McpServerDefinition = {
  name: 'github',
  transport: {
    kind: 'stdio',
    command: 'github-mcp-server',
    args: [],
    env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } },
  },
  requiredSecrets: ['GITHUB_TOKEN'],
}

describe('RegistryClient MCP 与 Bundle API', () => {
  const fetchMock = vi.fn()
  let client: RegistryClient

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    client = new RegistryClient('https://registry.example.com/', 'team-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('搜索 MCP 时编码查询并携带认证信息', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ org: 'acme', name: 'github' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(client.searchMcpServers('git hub')).resolves.toEqual([
      { org: 'acme', name: 'github' },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.example.com/api/mcp-servers?q=git%20hub',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer team-token' }),
      }),
    )
  })

  it('发布 MCP 时只发送版本、描述和 Canonical Definition', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await client.publishMcpServer('acme', definition, '1.2.0', 'GitHub tools')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://registry.example.com/api/mcp-servers/acme/github')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      version: '1.2.0',
      description: 'GitHub tools',
      definition,
    })
  })

  it('读写 required MCP 策略并支持带版本读取混合 Bundle', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(['github']), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            org: 'acme',
            name: 'developer-kit',
            version: '2.0.0',
            skills: [{ name: 'commit-style' }],
            mcpServers: [{ name: 'github', version: '1.2.0' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    await expect(client.requiredMcpServers('acme')).resolves.toEqual(['github'])
    await client.setRequiredMcpServers('acme', ['github', 'database'])
    await expect(client.getBundle('acme', 'developer-kit', '2.0.0')).resolves.toMatchObject({
      mcpServers: [{ name: 'github', version: '1.2.0' }],
    })

    const [, policyInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(policyInit.method).toBe('PUT')
    expect(JSON.parse(String(policyInit.body))).toEqual({ mcpServers: ['github', 'database'] })
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://registry.example.com/api/bundles/acme/developer-kit?version=2.0.0',
    )
  })

  it('把 Registry 错误状态和消息转换为 RegistryError', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(client.getMcpServer('acme', 'github')).rejects.toEqual(
      expect.objectContaining<Partial<RegistryError>>({ status: 403, message: 'forbidden' }),
    )
  })
})
