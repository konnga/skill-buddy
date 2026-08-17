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
import type { AppInfo, ConfirmOptions, UpdateCheckResult } from '../../shared/ipc.js'
import type { DesktopPreferences } from '../../shared/ipc.js'
import {
  getDesktopPreferences,
  onDesktopPreferencesChanged,
  setDesktopPreferences,
} from '../preferences.js'
import { toggleMainWindow } from '../window.js'

/** 检查更新所用的 GitHub 仓库（Releases 页）。 */
const UPDATE_REPO = 'konnga/skill-buddy'

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
    const endpoint = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'SkillBuddy' }
    try {
      // 先走 session（代理生效），失败退回 Node 直连
      let response: Response
      try {
        response = await session.defaultSession.fetch(endpoint, {
          headers,
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10_000) })
      }
      // 仓库尚未发布任何 Release 时 GitHub 返回 404
      if (response.status === 404) return { status: 'none' }
      if (!response.ok) return { status: 'error', message: `GitHub ${response.status}` }
      const data = (await response.json()) as { tag_name?: string; html_url?: string }
      const latest = (data.tag_name ?? '').replace(/^v/, '')
      if (!latest) return { status: 'none' }
      return {
        status: isNewer(latest, app.getVersion()) ? 'update' : 'latest',
        latest,
        url: data.html_url ?? `https://github.com/${UPDATE_REPO}/releases`,
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

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
