import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { TrayCommand } from '../shared/ipc.js'
import { getDesktopPreferences } from './preferences.js'
import { openLink } from './in-app-browser.js'

let mainWindow: BrowserWindow | null = null
let quitting = false

/** 返回开发态与打包态均可访问的桌面应用图标路径。 */
export function desktopIconPath(): string {
  const iconName = process.platform === 'darwin' ? 'icon-mac.png' : 'icon.png'

  return app.isPackaged
    ? join(process.resourcesPath, iconName)
    : join(import.meta.dirname, `../../resources/icons/${iconName}`)
}

/** 创建并配置 SkillBuddy 主窗口。 */
export function createWindow(options: { showOnReady?: boolean } = {}): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  const { showOnReady = true } = options
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: desktopIconPath(),
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          backgroundColor: '#00000000',
          trafficLightPosition: { x: 14, y: 13 },
        }
      : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
    },
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    if (showOnReady) showMainWindow()
  })
  window.on('close', (event) => {
    if (quitting || !getDesktopPreferences().backgroundMode) return
    event.preventDefault()
    window.hide()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openLink(window, url)
    return { action: 'deny' }
  })
  // setWindowOpenHandler 只覆盖新窗口请求；Markdown 渲染出的普通 <a href>
  // 会让当前窗口就地导航，这里把所有跨源导航拦下，按用户设置分流打开。
  window.webContents.on('will-navigate', (event, url) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(url).origin === new URL(window.webContents.getURL()).origin
    } catch {
      /* 非法 URL 一律拦截 */
    }
    if (sameOrigin) return
    event.preventDefault()
    openLink(window, url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}

/** 显示、恢复并聚焦主窗口。 */
export function showMainWindow(): void {
  const window = mainWindow ?? createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
  window.focus()
}

/** 在全局快捷键中切换主窗口显示状态。 */
export function toggleMainWindow(): void {
  if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showMainWindow()
}

/** 向已加载的渲染进程发送托盘命令。 */
export function sendTrayCommand(command: TrayCommand): void {
  const window = mainWindow ?? createWindow({ showOnReady: false })
  const send = (): void => window.webContents.send('tray:command', command)
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', send)
  else send()
}

/** 标记应用正在真正退出，避免 close 事件再次隐藏窗口。 */
export function setQuitting(value: boolean): void {
  quitting = value
}
