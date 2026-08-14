import { BrowserWindow, ipcMain, session } from 'electron'
import { validateMcpDefinition } from '@skillbuddy/core'
import type { McpServerDefinition } from '@skillbuddy/core'
import type {
  McpSoCard,
  McpSoDetail,
  ModelScopeMcpCategory,
  ModelScopeMcpDetail,
  ModelScopeMcpStats,
  ModelScopeMcpSummary,
} from '../../shared/ipc.js'
import { marketFetch } from './market.js'
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

/** 魔搭 OpenAPI 根地址；搜索与详情为公开接口，无需令牌。 */
const MODELSCOPE_API = 'https://modelscope.cn/openapi/v1'
/** 魔搭官网列表接口，支持分类聚合与服务端筛选。 */
const MODELSCOPE_DOLPHIN_API = 'https://modelscope.cn/api/v1/dolphin'
/** mcp.so 无公开 API，搜索与详情均解析其服务端渲染页面。 */
const MCPSO_ORIGIN = 'https://mcp.so'

let modelScopeSessionWarmup: Promise<void> | undefined

/**
 * 在沙箱化隐藏窗口中完成魔搭网页的 WAF/CSRF 会话初始化。
 * 窗口只在 Cookie 缺失或失效时短暂存在，后续请求复用默认 session。
 */
async function ensureModelScopeSession(force = false): Promise<void> {
  if (!force) {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://modelscope.cn' })
    if (cookies.some((cookie) => cookie.name === 'acw_sc__v2')) return
  }
  if (modelScopeSessionWarmup) return modelScopeSessionWarmup

  modelScopeSessionWarmup = (async () => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    window.webContents.setAudioMuted(true)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      await window.loadURL('https://modelscope.cn/mcp')
      const ready = await window.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const deadline = Date.now() + 15000
          const timer = setInterval(() => {
            const cookies = document.cookie
            if (cookies.includes('csrf_token=') && cookies.includes('acw_sc__v2=')) {
              clearInterval(timer)
              resolve(true)
            } else if (Date.now() >= deadline) {
              clearInterval(timer)
              resolve(false)
            }
          }, 200)
        })
      `)
      if (ready !== true) throw new Error('modelscope session warmup timed out')
    } finally {
      if (!window.isDestroyed()) window.destroy()
    }
  })().finally(() => {
    modelScopeSessionWarmup = undefined
  })
  return modelScopeSessionWarmup
}

async function fetchModelScopeDolphin(body: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ensureModelScopeSession(attempt > 0)
    const csrfCookie = (
      await session.defaultSession.cookies.get({
        url: 'https://modelscope.cn',
        name: 'csrf_token',
      })
    )[0]
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.value) : ''
    const response = await marketFetch(`${MODELSCOPE_DOLPHIN_API}/mcpServers`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        origin: 'https://modelscope.cn',
        referer: 'https://modelscope.cn/mcp',
        'x-csrf-token': csrfToken,
        'x-modelscope-accept-language': 'zh_CN',
      },
      body,
    })
    if (!response.ok) {
      if (attempt === 0) continue
      throw new Error(`modelscope ${response.status}`)
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { Code?: number }
      if (payload.Code === 200 || attempt > 0) return payload
    }
  }
  throw new Error('modelscope session unavailable')
}

async function fetchModelScopeLegacy(
  term: string,
  pageNumber: number,
): Promise<{
  items: ModelScopeMcpSummary[]
  total: number
  categories: ModelScopeMcpCategory[]
}> {
  const response = await marketFetch(`${MODELSCOPE_API}/mcp/servers`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ search: term, page_number: pageNumber, page_size: 24 }),
  })
  if (!response.ok) throw new Error(`modelscope ${response.status}`)
  const payload = (await response.json()) as ModelScopeEnvelope<unknown>
  if (payload.success === false) throw new Error(payload.message || 'modelscope request failed')
  const result = normalizeModelScopeList(payload.data)
  return { ...result, total: Math.min(result.total, 96), categories: [] }
}

async function fetchModelScopeStats(ids: string[]): Promise<ModelScopeMcpStats[]> {
  const statsList: ModelScopeMcpStats[] = []
  const batchSize = 6
  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = await Promise.all(
      ids.slice(start, start + batchSize).map(async (id): Promise<ModelScopeMcpStats> => {
        try {
          const response = await marketFetch(
            `https://modelscope.cn/mcp/servers/${id.split('/').map(encodeURIComponent).join('/')}`,
            { timeoutMs: 8_000 },
          )
          if (!response.ok) return { id }
          const stats = parseModelScopeWebStats(await response.text())
          return { id, ...stats }
        } catch {
          return { id }
        }
      }),
    )
    statsList.push(...batch)
  }
  return statsList
}

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
    async (
      _event,
      query: string,
      page = 1,
      category = '',
    ): Promise<{
      items: ModelScopeMcpSummary[]
      total: number
      categories: ModelScopeMcpCategory[]
    }> => {
      const term = typeof query === 'string' ? query.trim().slice(0, 200) : ''
      const pageNumber = Number.isInteger(page) ? Math.min(1_000, Math.max(1, page)) : 1
      const categoryValue =
        typeof category === 'string' && /^[\w-]{1,80}$/.test(category) ? category : ''
      const criterion = categoryValue
        ? [
            {
              Category: 'Category',
              Predicate: 'contains',
              StringValues: [categoryValue],
            },
          ]
        : []
      try {
        const payload = (await fetchModelScopeDolphin(
          JSON.stringify({
            PageSize: 24,
            PageNumber: pageNumber,
            Query: term,
            Criterion: criterion,
          }),
        )) as { Code?: number; Message?: string }
        if (payload.Code !== 200) throw new Error(payload.Message || 'modelscope request failed')
        return normalizeModelScopeDolphinList(payload)
      } catch (cause) {
        if (categoryValue) throw cause
        return fetchModelScopeLegacy(term, Math.min(4, pageNumber))
      }
    },
  )

  ipcMain.handle(
    'mcp-market:modelscope-stats',
    async (_event, ids: string[]): Promise<ModelScopeMcpStats[]> => {
      if (
        !Array.isArray(ids) ||
        ids.length > 24 ||
        ids.some((id) => typeof id !== 'string' || !/^@?[\w.-]+\/[\w.-]+$/.test(id))
      ) {
        throw new Error('invalid modelscope stats request')
      }
      return fetchModelScopeStats([...new Set(ids)])
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
    async (_event, query: string, category = ''): Promise<{ items: McpSoCard[] }> => {
      const term = typeof query === 'string' ? query.trim().slice(0, 200) : ''
      const categoryValue =
        typeof category === 'string' && /^[\w-]{1,80}$/.test(category) ? category : ''
      const url = categoryValue
        ? `${MCPSO_ORIGIN}/servers?category=${encodeURIComponent(categoryValue)}`
        : term
          ? `${MCPSO_ORIGIN}/search?q=${encodeURIComponent(term)}`
          : `${MCPSO_ORIGIN}/servers`
      const items = parseMcpSoCards(await fetchMcpSoPage(url))
      if (!categoryValue || !term) return { items }
      const normalizedTerm = term.toLocaleLowerCase()
      return {
        items: items.filter((item) =>
          [item.name, item.author, item.description, item.category].some((value) =>
            value.toLocaleLowerCase().includes(normalizedTerm),
          ),
        ),
      }
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
