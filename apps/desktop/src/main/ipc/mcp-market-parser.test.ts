import { describe, expect, it } from 'vitest'
import {
  decodeHtmlEntities,
  firstExternalLink,
  normalizeModelScopeDetail,
  normalizeModelScopeDolphinList,
  normalizeModelScopeList,
  parseModelScopeWebStats,
  parseMcpSoCards,
  parseMcpSoConfigs,
  parseMcpSoLdJson,
} from './mcp-market-parser.js'

describe('mcp.so 页面解析', () => {
  it('解析属性顺序和引号风格不同的搜索卡片', () => {
    const html = `
      <html><head><title>Search</title></head><body>
        <a class='card group' data-kind='server' href='/servers/firecrawl'>
          <img loading='lazy' src='https://example.com/firecrawl.png'>
          <h3 class='truncate font-semibold'>Firecrawl &amp; Search</h3>
          <p class='text-xs text-muted-foreground truncate'>mendableai</p>
          <p class='min-h-10 line-clamp-2 text-sm'>Search &lt;and&gt; scrape</p>
          <span class='bg-secondary tracking-wide uppercase'>Browser &amp; Automation</span>
        </a>
      </body></html>
    `

    expect(parseMcpSoCards(html)).toEqual([
      {
        slug: 'firecrawl',
        name: 'Firecrawl & Search',
        author: 'mendableai',
        description: 'Search <and> scrape',
        category: 'Browser & Automation',
        iconUrl: 'https://example.com/firecrawl.png',
      },
    ])
  })

  it('页面仍含 server 链接但卡片结构变化时明确报错', () => {
    expect(() => parseMcpSoCards('<a href="/servers/changed"><strong>Name</strong></a>')).toThrow(
      '页面结构已变化',
    )
  })

  it('解析 LD+JSON 与去重后的安装配置', () => {
    const config = '{&quot;mcpServers&quot;:{&quot;fetch&quot;:{&quot;command&quot;:&quot;uvx&quot;}}}'
    const html = `
      <script data-id="meta" type="application/ld+json">
        {"@type":"SoftwareApplication","name":"Fetch"}
      </script>
      <code>${config}</code>
      <code class="copy">${config}</code>
      <code>{not-json}</code>
    `

    expect(parseMcpSoLdJson(html)).toEqual([
      { '@type': 'SoftwareApplication', name: 'Fetch' },
    ])
    expect(parseMcpSoConfigs(html)).toEqual([
      { mcpServers: { fetch: { command: 'uvx' } } },
    ])
  })

  it('解码常见 HTML 实体', () => {
    expect(decodeHtmlEntities('&quot;x&quot; &amp; &#39;y&#39; &lt;z&gt;&nbsp;')).toBe(
      '"x" & \'y\' <z> ',
    )
  })

  it('解析单双引号与不同属性顺序的来源链接', () => {
    expect(
      firstExternalLink(
        "<a class='source' href='https://github.com/acme/mcp?tab=readme'>Source</a>",
        'https://github.com/',
      ),
    ).toBe('https://github.com/acme/mcp?tab=readme')
  })
})

describe('魔搭响应归一化', () => {
  it('解析详情页内嵌的调用量、收藏数和浏览量', () => {
    const encoded = JSON.stringify({ CallVolume: 776600, Stars: 62, ViewCount: 44800 })
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
    expect(parseModelScopeWebStats(`window.__detail_data__ = "${encoded}";`)).toEqual({
      usageCount: 776600,
      favoriteCount: 62,
      viewCount: 44800,
    })
  })

  it('过滤无效列表项并保留中英文元数据', () => {
    expect(
      normalizeModelScopeList({
        total_count: 2,
        mcp_server_list: [
          {
            id: '@modelcontextprotocol/fetch',
            name: '网页抓取',
            description: '抓取网页',
            view_count: 10,
            tags: ['browser'],
            locales: { en: { name: 'fetch', description: 'Fetch web pages' } },
          },
          { name: 'missing id' },
        ],
      }),
    ).toEqual({
      total: 2,
      items: [
        expect.objectContaining({
          id: '@modelcontextprotocol/fetch',
          name: '网页抓取',
          englishName: 'fetch',
          englishDescription: 'Fetch web pages',
          viewCount: 10,
          tags: ['browser'],
        }),
      ],
    })
  })

  it('解析 Dolphin 分类聚合、列表数据与统计字段', () => {
    expect(
      normalizeModelScopeDolphinList({
        Code: 200,
        Data: {
          FiledAgg: {
            Category: [
              { Value: 'browser-automation', Count: 594 },
              { Value: '', Count: 1 },
            ],
          },
          McpServer: {
            TotalCount: 1,
            McpServers: [
              {
                Publisher: '@modelcontextprotocol/fetch',
                Name: 'fetch',
                ChineseName: 'Fetch网页内容抓取',
                Abstract: 'Fetch web pages',
                AbstractCN: '抓取网页',
                FromSiteIcon: 'https://example.com/fetch.png',
                Category: ['browser-automation'],
                Tags: ['web'],
                CallVolume: 310_000,
                ViewCount: 580_000,
                Stars: 856,
              },
            ],
          },
        },
      }),
    ).toEqual({
      total: 1,
      categories: [{ value: 'browser-automation', count: 594 }],
      items: [
        expect.objectContaining({
          id: '@modelcontextprotocol/fetch',
          chineseName: 'Fetch网页内容抓取',
          englishName: 'fetch',
          categories: ['browser-automation'],
          usageCount: 310_000,
          viewCount: 580_000,
          favoriteCount: 856,
        }),
      ],
    })
  })

  it('拒绝缺少列表主体或详情 id 的响应', () => {
    expect(() => normalizeModelScopeList({ total_count: 1 })).toThrow('response invalid')
    expect(() => normalizeModelScopeDetail({ name: 'missing id' }, 'fallback/id')).toThrow(
      'response invalid',
    )
  })

  it('归一化详情配置与必填环境变量', () => {
    expect(
      normalizeModelScopeDetail(
        {
          id: 'acme/fetch',
          author: 'acme',
          is_hosted: true,
          is_verified: 'yes',
          env_schema: { required: ['TOKEN', 1] },
          server_config: [{ mcpServers: {} }],
        },
        'fallback/id',
      ),
    ).toMatchObject({
      id: 'acme/fetch',
      author: 'acme',
      isHosted: true,
      isVerified: false,
      requiredEnv: ['TOKEN'],
      configs: [{ mcpServers: {} }],
    })
  })
})
