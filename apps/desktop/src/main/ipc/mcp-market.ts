import { ipcMain } from 'electron'
import { validateMcpDefinition } from '@skillbuddy/core'
import type { McpServerDefinition } from '@skillbuddy/core'
import type {
  McpSoCard,
  McpSoDetail,
  ModelScopeMcpDetail,
  ModelScopeMcpSummary,
} from '../../shared/ipc.js'
import { marketFetch } from './market.js'
import {
  decodeHtmlEntities,
  firstExternalLink,
  normalizeModelScopeDetail,
  normalizeModelScopeList,
  parseMcpSoCards,
  parseMcpSoConfigs,
  parseMcpSoLdJson,
} from './mcp-market-parser.js'

/** 魔搭 OpenAPI 根地址；搜索与详情为公开接口，无需令牌。 */
const MODELSCOPE_API = 'https://modelscope.cn/openapi/v1'
/** mcp.so 无公开 API，搜索与详情均解析其服务端渲染页面。 */
const MCPSO_ORIGIN = 'https://mcp.so'

interface ModelScopeEnvelope<T> {
  success?: boolean
  message?: string
  data?: T
}

/** mcp.so 页面偶含零散空字节，会让文本匹配与 JSON.parse 静默失败，统一剔除。 */
async function fetchMcpSoPage(url: string): Promise<string> {
  const response = await marketFetch(url, { timeoutMs: 15_000 })
  if (!response.ok) throw new Error(`mcp.so ${response.status}`)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType && !contentType.includes('text/html')) {
    throw new Error(`mcp.so 返回了非 HTML 内容（${contentType}）`)
  }
  const html = (await response.text()).replaceAll('\u0000', '')
  if (!/<html\b/i.test(html) || !/<title\b/i.test(html)) {
    throw new Error('mcp.so 返回了无法识别的页面')
  }
  if (/cf-chl-|just a moment|captcha|verify you are human/i.test(html)) {
    throw new Error('mcp.so 暂时要求人机验证，请稍后重试')
  }
  return html
}

/** 注册公共 MCP 市场（魔搭 MCP 广场 / mcp.so）相关 IPC。 */
export function registerMcpMarketIpc(): void {
  ipcMain.handle(
    'mcp-market:modelscope-search',
    async (_event, query: string, page = 1): Promise<{ items: ModelScopeMcpSummary[]; total: number }> => {
      const term = typeof query === 'string' ? query.trim().slice(0, 200) : ''
      const pageNumber = Number.isInteger(page) ? Math.min(4, Math.max(1, page)) : 1
      // 官方 OpenAPI 的列表接口即为 PUT 语义（body 携带筛选条件）
      const response = await marketFetch(`${MODELSCOPE_API}/mcp/servers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ search: term, page_number: pageNumber, page_size: 24 }),
      })
      if (!response.ok) throw new Error(`modelscope ${response.status}`)
      const payload = (await response.json()) as ModelScopeEnvelope<unknown>
      if (payload.success === false) throw new Error(payload.message || 'modelscope request failed')
      return normalizeModelScopeList(payload.data)
    },
  )

  ipcMain.handle(
    'mcp-market:modelscope-detail',
    async (_event, id: string): Promise<ModelScopeMcpDetail> => {
      if (typeof id !== 'string' || !/^@?[\w.-]+\/[\w.-]+$/.test(id)) {
        throw new Error('invalid modelscope MCP id')
      }
      // id 形如 @org/name 或 user/name，路径按段编码以保留分隔符
      const path = id.split('/').map(encodeURIComponent).join('/')
      const response = await marketFetch(`${MODELSCOPE_API}/mcp/servers/${path}`, {
        timeoutMs: 15_000,
      })
      if (!response.ok) throw new Error(`modelscope ${response.status}`)
      const payload = (await response.json()) as ModelScopeEnvelope<unknown>
      if (payload.success === false || !payload.data) {
        throw new Error(payload.message || 'modelscope request failed')
      }
      return normalizeModelScopeDetail(payload.data, id)
    },
  )

  ipcMain.handle(
    'mcp-market:mcpso-search',
    async (_event, query: string): Promise<{ items: McpSoCard[] }> => {
      const term = typeof query === 'string' ? query.trim().slice(0, 200) : ''
      const url = term
        ? `${MCPSO_ORIGIN}/search?q=${encodeURIComponent(term)}`
        : `${MCPSO_ORIGIN}/servers`
      return { items: parseMcpSoCards(await fetchMcpSoPage(url)) }
    },
  )

  ipcMain.handle('mcp-market:mcpso-detail', async (_event, slug: string): Promise<McpSoDetail> => {
    if (!/^[\w.~-]+$/.test(slug)) throw new Error('invalid mcp.so slug')
    const html = await fetchMcpSoPage(`${MCPSO_ORIGIN}/servers/${slug}`)
    const application = parseMcpSoLdJson(html).find(
      (block) => block['@type'] === 'SoftwareApplication',
    )
    if (!application) throw new Error('mcp.so 页面结构已变化，暂时无法解析详情')
    const author = application?.author as { name?: string } | undefined
    return {
      slug,
      name:
        typeof application?.name === 'string'
          ? application.name
          : decodeHtmlEntities(html.match(/<title>([^<|]*)/)?.[1] ?? slug).trim(),
      description: typeof application?.description === 'string' ? application.description : '',
      author: author?.name ?? '',
      category:
        typeof application?.applicationCategory === 'string' ? application.applicationCategory : '',
      iconUrl: typeof application?.image === 'string' ? application.image : null,
      sourceUrl: firstExternalLink(html, 'https://github.com/'),
      configs: parseMcpSoConfigs(html),
    }
  })

  ipcMain.handle(
    'mcp-market:validate-definitions',
    (_event, definitions: McpServerDefinition[]): { valid: boolean; error?: string }[] => {
      if (!Array.isArray(definitions) || definitions.length > 50) {
        throw new Error('invalid MCP market definitions')
      }
      return definitions.map((definition) => {
        try {
          validateMcpDefinition(definition, { source: 'user-input' })
          return { valid: true }
        } catch (cause) {
          return { valid: false, error: cause instanceof Error ? cause.message : String(cause) }
        }
      })
    },
  )
}
