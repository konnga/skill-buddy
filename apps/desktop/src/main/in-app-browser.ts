import { BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'
import type { InAppBrowserState, LinkOpenMode } from '../shared/ipc.js'

/** 与渲染进程 InAppBrowser.vue 工具栏（h-12）保持一致的高度。 */
const TOOLBAR_HEIGHT = 48

let mode: LinkOpenMode = 'external'
let view: WebContentsView | null = null
let host: BrowserWindow | null = null

function currentState(): InAppBrowserState {
  const wc = view?.webContents
  return {
    open: view !== null,
    url: wc?.getURL() ?? '',
    title: wc?.getTitle() ?? '',
    canGoBack: wc?.navigationHistory.canGoBack() ?? false,
    canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    loading: wc?.isLoading() ?? false,
  }
}

function sendState(): void {
  if (host && !host.isDestroyed()) host.webContents.send('browser:state', currentState())
}

/** 让视图铺满工具栏以下的内容区。 */
function layout(): void {
  if (!host || !view || host.isDestroyed()) return
  const { width, height } = host.getContentBounds()
  view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) })
}

function openInApp(win: BrowserWindow, url: string): void {
  host = win
  if (!view) {
    view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true },
    })
    view.setBackgroundColor('#ffffff')
    const wc = view.webContents
    // 页面内 target=_blank 也留在应用内浏览器里打开
    wc.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:\/\//.test(target)) void wc.loadURL(target)
      return { action: 'deny' }
    })
    for (const event of [
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated',
      'did-start-loading',
      'did-stop-loading',
    ] as const) {
      wc.on(event as 'did-navigate', () => sendState())
    }
    win.contentView.addChildView(view)
    win.on('resize', layout)
  }
  layout()
  void view.webContents.loadURL(url)
  sendState()
}

function closeBrowser(): void {
  if (!view) return
  if (host && !host.isDestroyed()) {
    host.contentView.removeChildView(view)
    host.off('resize', layout)
  }
  view.webContents.close()
  view = null
  sendState()
  host = null
}

/** 有网页历史时后退，否则退出应用内浏览器并返回 SkillBuddy。 */
function goBackOrClose(): void {
  const history = view?.webContents.navigationHistory
  if (history?.canGoBack()) history.goBack()
  else closeBrowser()
}

/**
 * 按用户设置分流打开链接：默认浏览器 external，或应用内浏览器 in-app。
 * 非 http(s) 链接一律忽略。
 */
export function openLink(win: BrowserWindow, url: string): void {
  if (!/^https?:\/\//.test(url)) return
  if (mode === 'in-app') openInApp(win, url)
  else void shell.openExternal(url)
}

export function registerBrowserIpc(): void {
  ipcMain.handle('links:set-mode', (_event, next: LinkOpenMode) => {
    mode = next === 'in-app' ? 'in-app' : 'external'
  })
  // 模式感知的打开入口：组件里的「查看链接」类按钮统一走这里
  ipcMain.handle('links:open', (event, url: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) openLink(win, url)
  })
  ipcMain.handle('browser:open', (event, url: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && /^https?:\/\//.test(url)) openInApp(win, url)
  })
  ipcMain.handle('browser:close', () => closeBrowser())
  ipcMain.handle('browser:back', () => goBackOrClose())
  ipcMain.handle('browser:forward', () => view?.webContents.navigationHistory.goForward())
  ipcMain.handle('browser:reload', () => view?.webContents.reload())
  ipcMain.handle('browser:state', () => currentState())
}
