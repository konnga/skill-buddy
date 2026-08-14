import { describe, expect, it } from 'vitest'
import {
  candidatesFromModelScope,
  extractCandidates,
  mapMcpSoItem,
  mapModelScopeItem,
} from './mcp-market.js'

describe('MCP 市场配置转换', () => {
  it('按界面语言映射魔搭名称与描述', () => {
    const raw = {
      id: '@modelcontextprotocol/fetch',
      name: 'Fetch 网页内容抓取',
      chineseName: 'Fetch 网页内容抓取',
      englishName: 'fetch',
      description: '抓取网页',
      englishDescription: 'Fetch web pages',
      iconUrl: null,
      tags: [],
      categories: ['browser-automation'],
      viewCount: 10,
      publisher: '@modelcontextprotocol/fetch',
    }

    expect(mapModelScopeItem(raw, true)).toMatchObject({
      name: 'Fetch 网页内容抓取',
      description: '抓取网页',
    })
    expect(mapModelScopeItem(raw, false)).toMatchObject({
      name: 'fetch',
      description: 'Fetch web pages',
    })
  })

  it('将 mcp.so 分类映射为统一卡片标签', () => {
    expect(
      mapMcpSoItem({
        slug: 'firecrawl',
        name: 'Firecrawl',
        author: 'mendableai',
        description: 'Search and scrape',
        category: 'Browser & Automation',
        iconUrl: null,
      }),
    ).toMatchObject({ tags: ['Browser & Automation'] })
  })

  it('stdio 配置丢弃明文值并保留环境变量引用名', () => {
    const [candidate] = extractCandidates(
      [
        {
          mcpServers: {
            fetch: {
              command: 'npx',
              args: ['-y', 'fetch-mcp'],
              env: {
                API_TOKEN: '${FETCH_TOKEN}',
                API_HOST: 'https://example.com',
              },
            },
          },
        },
      ],
      'Fetch server',
      ['DECLARED_SECRET'],
    )

    expect(candidate?.definition).toEqual({
      name: 'fetch',
      description: 'Fetch server',
      transport: {
        kind: 'stdio',
        command: 'npx',
        args: ['-y', 'fetch-mcp'],
        env: {
          API_TOKEN: { kind: 'env', name: 'FETCH_TOKEN' },
          API_HOST: { kind: 'env', name: 'API_HOST' },
        },
      },
      requiredSecrets: ['API_HOST', 'DECLARED_SECRET', 'FETCH_TOKEN'],
    })
  })

  it('识别 baseUrl、transport 别名和 Header 引用', () => {
    const candidates = extractCandidates(
      [
        {
          mcpServers: {
            remote: {
              type: 'streamableHttp',
              baseUrl: 'https://example.com/mcp',
              headers: {
                Authorization: '${AUTH_TOKEN}',
                'X-API-Key': 'Bearer ${TOKEN}',
              },
            },
            socket: {
              type: 'ws',
              url: 'wss://example.com/mcp',
            },
          },
        },
      ],
      '',
    )

    expect(candidates[0]?.definition).toMatchObject({
      transport: {
        kind: 'streamable-http',
        url: 'https://example.com/mcp',
        headers: {
          Authorization: { kind: 'env', name: 'AUTH_TOKEN' },
          'X-API-Key': { kind: 'env', name: 'X_API_KEY' },
        },
      },
      requiredSecrets: ['AUTH_TOKEN', 'X_API_KEY'],
    })
    expect(candidates[1]?.definition.transport).toEqual({
      kind: 'websocket',
      url: 'wss://example.com/mcp',
      headers: {},
    })
  })

  it('过滤无法识别的配置并按名称和入口去重', () => {
    const config = { mcpServers: { fetch: { command: 'uvx', args: ['fetch'] } } }
    expect(extractCandidates([config, config, { mcpServers: { invalid: {} } }], '')).toHaveLength(1)
  })

  it('英文界面的安装定义使用魔搭英文描述', () => {
    const [candidate] = candidatesFromModelScope(
      {
        id: 'acme/fetch',
        name: '网页抓取',
        chineseName: '网页抓取',
        englishName: 'fetch',
        description: '抓取网页',
        englishDescription: 'Fetch web pages',
        iconUrl: null,
        tags: [],
        categories: [],
        viewCount: 0,
        publisher: 'acme/fetch',
        author: 'acme',
        sourceUrl: null,
        readme: '',
        githubStars: 0,
        isHosted: false,
        isVerified: false,
        requiredEnv: [],
        configs: [{ mcpServers: { fetch: { command: 'uvx', args: ['fetch'] } } }],
      },
      false,
    )

    expect(candidate?.definition.description).toBe('Fetch web pages')
  })
})
