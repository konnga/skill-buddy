import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  session,
  shell,
} from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  AppInfo,
  ConfirmOptions,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateDownloadResult,
  UpdateReleaseAsset,
} from '#shared/ipc'
import type { DesktopPreferences } from '#shared/ipc'
import {
  getDesktopPreferences,
  onDesktopPreferencesChanged,
  setDesktopPreferences,
} from '../preferences'
import { readSecret } from '../secrets.js'
import { toggleMainWindow } from '../window'

/** 检查更新所用的 GitHub 仓库（Releases 页）。 */
const UPDATE_REPO = 'konnga/skill-buddy'
const UPDATE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`
const UPDATE_LATEST_URL = `${UPDATE_RELEASES_URL}/latest`
const UPDATE_HEADERS = { 'user-agent': 'SkillBuddy' }

interface ReleaseAssetResponse {
  name?: string
  size?: number
  browser_download_url?: string
}

interface ReleaseResponse {
  tag_name?: string
  html_url?: string
  assets?: ReleaseAssetResponse[]
}

let cachedRelease: ReleaseResponse | null = null

interface ReleaseFetchResult {
  status: number
  data: ReleaseResponse
}

async function githubApiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...UPDATE_HEADERS,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  const token = await readSecret('githubToken')
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

async function updateFetch(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Response> {
  const { headers = UPDATE_HEADERS, timeoutMs = 10_000 } = options
  try {
    return await session.defaultSession.fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
  }
}

/** GitHub API 限流时，从公开 Releases 页面获取最新标签和安装包。 */
async function fetchLatestReleasePage(): Promise<ReleaseFetchResult> {
  const latestResponse = await updateFetch(UPDATE_LATEST_URL)
  if (!latestResponse.ok) return { status: latestResponse.status, data: {} }
  const latestHtml = await latestResponse.text()
  const tag =
    latestResponse.url.match(/\/releases\/tag\/([^/?#]+)/)?.[1]
    ?? latestHtml.match(/\/releases\/tag\/([^"/?#]+)/)?.[1]
  if (!tag) return { status: 404, data: {} }

  const assetsResponse = await updateFetch(
    `${UPDATE_RELEASES_URL}/expanded_assets/${encodeURIComponent(tag)}`,
  )
  const assets: ReleaseAssetResponse[] = []
  if (assetsResponse.ok) {
    const html = await assetsResponse.text()
    const pattern = /href="([^"]*\/releases\/download\/[^"]+)"/g
    for (const match of html.matchAll(pattern)) {
      const href = match[1]?.replaceAll('&amp;', '&')
      if (!href) continue
      const browserDownloadUrl = new URL(href, 'https://github.com').toString()
      const name = decodeURIComponent(new URL(browserDownloadUrl).pathname.split('/').at(-1) ?? '')
      if (name) assets.push({ name, size: 0, browser_download_url: browserDownloadUrl })
    }
  }
  return {
    status: 200,
    data: {
      tag_name: tag,
      html_url: `${UPDATE_RELEASES_URL}/tag/${tag}`,
      assets,
    },
  }
}

function updateAssetNames(platform: NodeJS.Platform, arch: string): string[] {
  if (platform === 'darwin' && arch === 'arm64') return ['.dmg']
  if (platform === 'win32' && arch === 'x64') return ['.exe']
  if (platform === 'linux' && arch === 'x64') return ['.AppImage']
  return []
}

function findUpdateAsset(data: ReleaseResponse): ReleaseAssetResponse | null {
  const suffixes = updateAssetNames(process.platform, process.arch)
  if (suffixes.length === 0) return null
  return data.assets?.find((item) => {
    const name = item.name ?? ''
    return suffixes.some((suffix) => name.endsWith(suffix)) && Boolean(item.browser_download_url)
  }) ?? null
}

function selectUpdateAsset(data: ReleaseResponse): UpdateReleaseAsset | null {
  const asset = findUpdateAsset(data)
  if (!asset?.name || !asset.browser_download_url) return null
  return { name: asset.name, size: asset.size ?? 0 }
}

async function fetchLatestRelease(): Promise<ReleaseFetchResult> {
  const response = await updateFetch(UPDATE_API, { headers: await githubApiHeaders() })
  if (response.ok) {
    const data = (await response.json()) as ReleaseResponse
    cachedRelease = data
    return { status: response.status, data }
  }
  if (response.status === 404) return { status: 404, data: {} }

  const fallback = await fetchLatestReleasePage()
  if (fallback.status === 200) cachedRelease = fallback.data
  return fallback
}

/** 简单的 x.y.z 版本比较：latest 是否比 current 新。 */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map((part) => parseInt(part, 10) || 0)
  const b = current.split('.').map((part) => parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0)
    if (delta !== 0) return delta > 0
  }
  return false
}

/** 注册应用信息、更新检查、系统集成（自启/快捷键/代理）与配置导入导出 IPC。 */
export function registerSystemIpc(): void {
  ipcMain.handle(
    'app:info',
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      platform: process.platform,
      arch: process.arch,
    }),
  )

  ipcMain.handle('app:check-update', async (): Promise<UpdateCheckResult> => {
    try {
      const { status, data } = await fetchLatestRelease()
      // 仓库尚未发布任何 Release 时 GitHub 返回 404
      if (status === 404) return { status: 'none' }
      if (status !== 200) return { status: 'error', message: `GitHub ${status}` }
      const latest = (data.tag_name ?? '').replace(/^v/, '')
      if (!latest) return { status: 'none' }
      const url = data.html_url ?? `https://github.com/${UPDATE_REPO}/releases`
      if (isNewer(latest, app.getVersion())) {
        return { status: 'update', latest, url, asset: selectUpdateAsset(data) }
      }
      return { status: 'latest', latest, url }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    'app:download-update',
    async (event, latest: string): Promise<UpdateDownloadResult> => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      if (!sender) throw new Error('应用窗口不存在')

      let temporaryPath = ''
      try {
        let data = cachedRelease
        if ((data?.tag_name ?? '').replace(/^v/, '') !== latest) {
          const result = await fetchLatestRelease()
          if (result.status !== 200) throw new Error(`GitHub ${result.status}`)
          data = result.data
        }
        if (!data) throw new Error('无法读取发布信息')
        const releaseVersion = (data.tag_name ?? '').replace(/^v/, '')
        if (releaseVersion !== latest) throw new Error('发布版本已变化，请重新检查更新')
        const asset = findUpdateAsset(data)
        if (!asset?.name || !asset.browser_download_url) {
          throw new Error('当前系统暂无可用安装包')
        }

        const responseAsset = await updateFetch(asset.browser_download_url, {
          timeoutMs: 30 * 60_000,
        })
        if (!responseAsset.ok || !responseAsset.body) throw new Error(`下载失败：${responseAsset.status}`)
        const downloadDir = app.getPath('downloads')
        const filePath = join(downloadDir, basename(asset.name))
        temporaryPath = `${filePath}.download`
        await fs.rm(temporaryPath, { force: true })
        const file = await fs.open(temporaryPath, 'w')
        const total = Number(responseAsset.headers.get('content-length')) || asset.size || 0
        let transferred = 0
        let lastPercent = -1
        try {
          for await (const chunk of responseAsset.body as AsyncIterable<Uint8Array>) {
            await file.write(chunk)
            transferred += chunk.byteLength
            const percent = total > 0
              ? Math.min(99, Math.round((transferred / total) * 100))
              : 0
            if (percent === lastPercent) continue
            lastPercent = percent
            const progress: UpdateDownloadProgress = {
              status: 'downloading',
              percent,
              transferred,
              total,
            }
            sender.webContents.send('app:update-progress', progress)
          }
        } finally {
          await file.close()
        }
        await fs.rm(filePath, { force: true })
        await fs.rename(temporaryPath, filePath)
        temporaryPath = ''
        if (process.platform === 'linux') await fs.chmod(filePath, 0o755)
        sender.webContents.send('app:update-progress', { status: 'completed', percent: 100, path: filePath } satisfies UpdateDownloadProgress)
        const openMessage = await shell.openPath(filePath)
        if (openMessage) shell.showItemInFolder(filePath)
        return {
          path: filePath,
          opened: openMessage === '',
          ...(openMessage ? { message: openMessage } : {}),
        }
      } catch (error) {
        if (temporaryPath) await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
        const message = error instanceof Error ? error.message : String(error)
        sender.webContents.send('app:update-progress', { status: 'error', message } satisfies UpdateDownloadProgress)
        throw error
      }
    },
  )

  function applyLoginItemSettings(openAtLogin: boolean): void {
    const preferences = getDesktopPreferences()
    const launchHidden = preferences.backgroundMode && preferences.launchHidden
    app.setLoginItemSettings({
      openAtLogin,
      ...(process.platform === 'win32' ? { args: launchHidden ? ['--hidden'] : [] } : {}),
    })
  }

  function readLoginItemEnabled(): boolean {
    if (process.platform !== 'win32') return app.getLoginItemSettings().openAtLogin
    return (
      app.getLoginItemSettings().openAtLogin ||
      app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
    )
  }

  let launchAtLoginEnabled = readLoginItemEnabled()

  /* 开机自启动 */
  ipcMain.handle('system:get-login-item', () => {
    launchAtLoginEnabled = readLoginItemEnabled()
    return launchAtLoginEnabled
  })
  ipcMain.handle('system:set-login-item', (_event, openAtLogin: boolean) => {
    launchAtLoginEnabled = openAtLogin
    applyLoginItemSettings(openAtLogin)
  })
  ipcMain.handle(
    'system:get-desktop-preferences',
    () => getDesktopPreferences(),
  )
  ipcMain.handle(
    'system:set-desktop-preferences',
    (_event, preferences: DesktopPreferences) => setDesktopPreferences(preferences),
  )
  onDesktopPreferencesChanged(() => {
    launchAtLoginEnabled = readLoginItemEnabled()
    if (launchAtLoginEnabled) applyLoginItemSettings(true)
  })

  /* 全局唤起快捷键：再次按下时隐藏窗口 */
  let registeredShortcut: string | null = null
  ipcMain.handle('system:set-global-shortcut', (_event, accelerator: string): boolean => {
    if (registeredShortcut) {
      globalShortcut.unregister(registeredShortcut)
      registeredShortcut = null
    }
    const value = accelerator.trim()
    if (!value) return true
    try {
      const ok = globalShortcut.register(value, () => {
        toggleMainWindow()
      })
      if (ok) registeredShortcut = value
      return ok
    } catch {
      return false
    }
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())

  /* HTTP 代理：作用于 Chromium 网络栈（渲染进程、net.fetch、应用内浏览器） */
  ipcMain.handle('network:set-proxy', async (_event, url: string) => {
    const value = url.trim()
    await session.defaultSession.setProxy(
      value ? { proxyRules: value } : { mode: 'system' },
    )
  })

  /* 配置导出 / 导入（文件对话框在主进程完成，渲染进程只见 JSON 字符串） */
  ipcMain.handle('config:export', async (event, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'skillbuddy-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, content, 'utf8')
    return true
  })

  ipcMain.handle('config:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return path ? await fs.readFile(path, 'utf8') : null
  })

  /* 原生确认对话框 */
  ipcMain.handle('dialog:confirm', async (event, options: ConfirmOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const result = await dialog.showMessageBox(win, {
      type: options.danger ? 'warning' : 'question',
      buttons: [options.confirmLabel, options.cancelLabel],
      defaultId: 0,
      cancelId: 1,
      message: options.title,
      detail: options.message,
    })
    return result.response === 0
  })

  ipcMain.handle('system:open-user-data', () => shell.openPath(app.getPath('userData')))
}
