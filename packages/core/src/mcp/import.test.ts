import { describe, expect, it } from 'vitest'
import { McpImportError, parseMcpServerConfig } from './import.js'
import { validateMcpDefinition } from './validate.js'

function parse(text: string) {
  return parseMcpServerConfig(text)
}

function first(text: string) {
  return parseMcpServerConfig(text).candidates[0]!
}

describe('parseMcpServerConfig', () => {
  it('解析标准 mcpServers 配置并保留完整命令行', () => {
    const candidate = first(
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            env: { ROOT: '${FS_ROOT}' },
            cwd: '/work',
          },
        },
      }),
    )

    expect(candidate.serverName).toBe('filesystem')
    expect(candidate.definition).toEqual({
      name: 'filesystem',
      transport: {
        kind: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        cwd: '/work',
        env: { ROOT: { kind: 'env', name: 'FS_ROOT' } },
      },
      requiredSecrets: ['FS_ROOT'],
    })
  })

  it('支持 servers / mcp.servers / mcp_servers 三种容器键', () => {
    const servers = { name: 'a', command: 'uvx', args: ['tool'] }
    for (const payload of [
      { servers: { remote: servers } },
      { mcp: { servers: { remote: servers } } },
      { mcp_servers: { remote: servers } },
    ]) {
      expect(parse(JSON.stringify(payload)).candidates.map((item) => item.serverName)).toEqual([
        'remote',
      ])
    }
  })

  it('解析 OpenCode 的 command 数组与 environment 字段', () => {
    const candidate = first(
      JSON.stringify({
        mcp: {
          fetch: {
            type: 'local',
            command: ['npx', '-y', 'fetch-mcp'],
            environment: { API_KEY: '{env:FETCH_KEY}' },
          },
        },
      }),
    )

    expect(candidate.definition.transport).toEqual({
      kind: 'stdio',
      command: 'npx',
      args: ['-y', 'fetch-mcp'],
      env: { API_KEY: { kind: 'env', name: 'FETCH_KEY' } },
    })
    expect(candidate.definition.requiredSecrets).toEqual(['FETCH_KEY'])
  })

  it('按 type 与 URL 路径还原远程传输类型', () => {
    const candidates = parse(
      JSON.stringify({
        mcpServers: {
          http: { type: 'streamableHttp', baseUrl: 'https://example.com/mcp' },
          sse: { url: 'https://example.com/sse' },
          socket: { type: 'ws', url: 'wss://example.com/ws' },
        },
      }),
    ).candidates

    expect(candidates.map((item) => item.definition.transport.kind)).toEqual([
      'streamable-http',
      'sse',
      'websocket',
    ])
  })

  it('丢弃明文值并改写为同名环境变量引用', () => {
    const result = parse(
      JSON.stringify({
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'ghp_realvalue', HOST: '${GH_HOST}' },
          },
        },
      }),
    )

    expect(result.candidates[0]?.definition).toMatchObject({
      transport: { env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } } },
      requiredSecrets: ['GH_HOST', 'GITHUB_TOKEN'],
    })
    expect(result.warnings).toEqual([
      { code: 'literal-discarded', serverName: 'github', detail: 'GITHUB_TOKEN' },
    ])
  })

  it('明文 env 保留原始大小写，不合并大小写不同的变量', () => {
    const result = parse(
      JSON.stringify({
        mcpServers: {
          proxy: {
            command: 'uvx',
            env: { https_proxy: 'http://local-proxy', HTTPS_PROXY: 'http://other-proxy' },
          },
        },
      }),
    )

    expect(result.candidates[0]?.definition).toMatchObject({
      transport: {
        env: {
          https_proxy: { kind: 'env', name: 'https_proxy' },
          HTTPS_PROXY: { kind: 'env', name: 'HTTPS_PROXY' },
        },
      },
      requiredSecrets: ['HTTPS_PROXY', 'https_proxy'],
    })
    expect(result.warnings).toEqual([
      { code: 'literal-discarded', serverName: 'proxy', detail: 'https_proxy' },
      { code: 'literal-discarded', serverName: 'proxy', detail: 'HTTPS_PROXY' },
    ])
  })

  it('移除参数里的明文凭据并告警', () => {
    const result = parse(
      JSON.stringify({
        mcpServers: {
          git: { command: 'uvx', args: ['git-mcp', '--token', 'abc123', '--verbose'] },
        },
      }),
    )

    expect(result.candidates[0]?.definition.transport).toMatchObject({
      args: ['git-mcp', '--verbose'],
    })
    expect(result.warnings).toEqual([
      { code: 'arg-secret-removed', serverName: 'git', detail: '--token' },
    ])
  })

  it('保留布尔开关形式的敏感参数', () => {
    const candidate = first(
      JSON.stringify({
        mcpServers: { tool: { command: 'uvx', args: ['tool', '--no-token-cache'] } },
      }),
    )

    expect(candidate.definition.transport).toMatchObject({ args: ['tool', '--no-token-cache'] })
  })

  it('把 Header 名归一为环境变量名', () => {
    const candidate = first(
      JSON.stringify({
        mcpServers: {
          remote: {
            url: 'https://example.com/mcp',
            headers: { 'X-API-Key': 'Bearer ${TOKEN}', Authorization: 'plain-value' },
          },
        },
      }),
    )

    expect(candidate.definition.transport).toMatchObject({
      headers: {
        'X-API-Key': { kind: 'env', name: 'X_API_KEY' },
        Authorization: { kind: 'env', name: 'AUTHORIZATION' },
      },
    })
    expect(candidate.definition.requiredSecrets).toEqual(['AUTHORIZATION', 'X_API_KEY'])
  })

  it('解析按项目分组的 ~/.claude.json 并带上项目根目录', () => {
    const result = parse(
      JSON.stringify({
        projects: {
          '/repo/app': {
            mcpServers: { db: { command: 'npx', args: ['-y', 'db-mcp'] } },
          },
        },
      }),
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      serverName: 'db',
      projectRoot: '/repo/app',
    })
  })

  it('解析单条 server 对象并推导名称', () => {
    expect(
      first(JSON.stringify({ command: 'npx', args: ['-y', '@acme/server-filesystem@1.2.0'] }))
        .serverName,
    ).toBe('filesystem')
    expect(first(JSON.stringify({ url: 'https://mcp.example.com/mcp' })).serverName).toBe('example')
  })

  it('解析市场形态的配置数组并保留全部安装方式', () => {
    const candidates = parse(
      JSON.stringify([
        { mcpServers: { fetch: { command: 'uvx', args: ['fetch'] } } },
        { mcpServers: { fetch: { url: 'https://example.com/mcp' } } },
      ]),
    ).candidates

    expect(candidates.map((item) => item.label)).toEqual([
      'uvx fetch',
      'https://example.com/mcp',
    ])
  })

  it('合并完全重复的条目', () => {
    const entry = { mcpServers: { fetch: { command: 'uvx', args: ['fetch'] } } }
    const result = parse(JSON.stringify([entry, entry]))

    expect(result.candidates).toHaveLength(1)
    expect(result.warnings).toEqual([
      { code: 'duplicate-entry', serverName: 'fetch', detail: 'fetch' },
    ])
  })

  it('同名同入口的 server 在不同项目下保留独立候选', () => {
    const server = { command: 'uvx', args: ['fetch'] }
    const result = parse(
      JSON.stringify({
        projects: {
          '/repo/a': { mcpServers: { fetch: server } },
          '/repo/b': { mcpServers: { fetch: server } },
        },
      }),
    )

    expect(result.candidates.map((candidate) => candidate.projectRoot)).toEqual(['/repo/a', '/repo/b'])
    expect(result.warnings).toEqual([])
  })

  it('同名同入口但工作目录或环境变量引用不同的配置不会合并', () => {
    const entries = [
      { command: 'uvx', args: ['fetch'], cwd: '/repo/a', env: { ROOT: '${ROOT_A}' } },
      { command: 'uvx', args: ['fetch'], cwd: '/repo/b', env: { ROOT: '${ROOT_A}' } },
      { command: 'uvx', args: ['fetch'], cwd: '/repo/a', env: { ROOT: '${ROOT_B}' } },
    ]
    const result = parse(JSON.stringify(entries.map((fetch) => ({ mcpServers: { fetch } }))))

    expect(result.candidates).toHaveLength(entries.length)
    expect(result.warnings).toEqual([])
  })

  it('同名同 URL 但传输类型或 Header 引用不同的配置不会合并', () => {
    const entries = [
      { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: '${AUTH_A}' } },
      { type: 'sse', url: 'https://example.com/mcp', headers: { Authorization: '${AUTH_A}' } },
      { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: '${AUTH_B}' } },
    ]
    const result = parse(JSON.stringify(entries.map((fetch) => ({ mcpServers: { fetch } }))))

    expect(result.candidates).toHaveLength(entries.length)
    expect(result.warnings).toEqual([])
  })

  it('不把展示文本相同但参数边界不同的命令视为重复', () => {
    const result = parse(
      JSON.stringify([
        { mcpServers: { tool: { command: 'node', args: ['a b'] } } },
        { mcpServers: { tool: { command: 'node', args: ['a', 'b'] } } },
      ]),
    )

    expect(result.candidates).toHaveLength(2)
    expect(result.warnings).toEqual([])
  })

  it('完整定义相同但 env 字段声明顺序不同仍能去重', () => {
    const result = parse(
      JSON.stringify([
        { mcpServers: { tool: { command: 'uvx', env: { A: '${A}', B: '${B}' } } } },
        { mcpServers: { tool: { env: { B: '${B}', A: '${A}' }, command: 'uvx' } } },
      ]),
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.warnings).toEqual([
      { code: 'duplicate-entry', serverName: 'tool', detail: 'tool' },
    ])
  })

  it('对无法导入的字段给出告警', () => {
    const result = parse(
      JSON.stringify({
        mcpServers: { tool: { command: 'uvx', args: ['tool'], oauth: { clientId: 'x' } } },
      }),
    )

    expect(result.warnings).toEqual([
      { code: 'ignored-field', serverName: 'tool', detail: 'oauth' },
    ])
  })

  it('跳过既没有 command 也没有 url 的条目', () => {
    const result = parse(
      JSON.stringify({
        mcpServers: { valid: { command: 'uvx' }, broken: { transport: 'sse' } },
      }),
    )

    expect(result.candidates.map((item) => item.serverName)).toEqual(['valid'])
    expect(result.warnings).toEqual([
      { code: 'unrecognized-server', detail: 'broken' },
    ])
  })

  it('容忍 JSONC 注释与尾逗号', () => {
    const candidate = first(`{
      // 注释
      "mcpServers": {
        "tool": { "command": "uvx", "args": ["tool"], },
      },
    }`)

    expect(candidate.serverName).toBe('tool')
  })

  it('报告 JSON 语法错误的行列位置', () => {
    try {
      parse('{\n  "mcpServers": {,}\n}')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(McpImportError)
      const importError = error as McpImportError
      expect(importError.code).toBe('MCP_IMPORT_PARSE_FAILED')
      expect(importError.position).toEqual({ line: 2, column: 18 })
    }
  })

  it('空输入与无 server 配置分别报错', () => {
    expect(() => parse('   ')).toThrowError(/请先粘贴/)
    expect(() => parse('{"foo":1}')).toThrowError(/没有在 JSON 中找到/)
  })

  it('解析结果可直接通过 user-input 校验', () => {
    const result = parse(
      JSON.stringify({
        mcpServers: {
          a: { command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'plain' } },
          b: { url: 'https://example.com/mcp', headers: { Authorization: '${AUTH}' } },
        },
      }),
    )

    for (const candidate of result.candidates) {
      expect(() => validateMcpDefinition(candidate.definition)).not.toThrow()
    }
  })
})
