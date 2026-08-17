import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { openLink } from './in-app-browser.js'

/** 返回开发态与打包态均可访问的桌面应用图标路径。 */
export function desktopIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(import.meta.dirname, '../../resources/icons/icon.png')
}

/** 创建并配置 SkillBuddy 主窗口。 */
export function createWindow(): void {
  const mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openLink(mainWindow, url)
    return { action: 'deny' }
  })
  // setWindowOpenHandler 只覆盖新窗口请求；Markdown 渲染出的普通 <a href>
  // 会让当前窗口就地导航，这里把所有跨源导航拦下，按用户设置分流打开。
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(url).origin === new URL(mainWindow.webContents.getURL()).origin
    } catch {
      /* 非法 URL 一律拦截 */
    }
    if (sameOrigin) return
    event.preventDefault()
    openLink(mainWindow, url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}
