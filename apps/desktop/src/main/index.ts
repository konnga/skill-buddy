import { app } from 'electron'
import { registerAiConversationIpc } from './ai-conversations.js'
import { registerBrowserIpc } from './in-app-browser.js'
import { registerMarketIpc } from './ipc/market.js'
import { registerBackupIpc } from './ipc/backup.js'
import { registerMcpIpc } from './ipc/mcp.js'
import { registerMcpMarketIpc } from './ipc/mcp-market.js'
import { registerSkillsIpc } from './ipc/skills.js'
import { registerSystemIpc } from './ipc/system.js'
import { registerTeamLibraryIpc } from './ipc/team-library.js'
import { registerInstructionsIpc } from './ipc/instructions.js'
import { PathAccessPolicy } from './path-policy.js'
import {
  flushDesktopPreferences,
  getDesktopPreferences,
  hasPendingDesktopPreferenceSaves,
  loadDesktopPreferences,
  onDesktopPreferencesChanged,
} from './preferences.js'
import { registerTrayIpc, TrayController } from './tray.js'
import {
  createWindow,
  desktopIconPath,
  sendTrayCommand,
  setQuitting,
  showMainWindow,
} from './window.js'

const pathPolicy = new PathAccessPolicy()
let disposeMcp: (() => void) | undefined
let disposeInstructions: (() => void) | undefined
let trayController: TrayController | undefined
let waitingForPreferenceFlush = false

if (app.isPackaged) {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase()
      const devToolsShortcut =
        key === 'f12' ||
        ((input.control || input.meta) && input.shift && (key === 'i' || key === 'j'))
      if (devToolsShortcut) event.preventDefault()
    })
    contents.on('devtools-opened', () => contents.closeDevTools())
  })
}

function registerIpc(tray: TrayController): void {
  registerSkillsIpc(pathPolicy)
  registerBackupIpc(pathPolicy)
  registerAiConversationIpc(pathPolicy)
  registerBrowserIpc()
  registerSystemIpc()
  registerMarketIpc(pathPolicy)
  registerMcpMarketIpc()
  registerTeamLibraryIpc(pathPolicy)
  const instructionService = registerInstructionsIpc()
  disposeInstructions = () => instructionService.stopWatch()
  registerTrayIpc(tray)
  const mcpService = registerMcpIpc()
  disposeMcp = () => mcpService.dispose()
}

function quitApplication(): void {
  setQuitting(true)
  app.quit()
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.on('second-instance', (_event, argv) => {
  if (!argv.includes('--hidden')) showMainWindow()
})

void app.whenReady().then(async () => {
  // Chromium 只在浏览器进程能确定应用语言时才会给渲染进程带上 `--lang`；拿不到时
  // 渲染进程的 locale 是空串（content/renderer/render_thread_impl.cc），Blink 的
  // `DefaultLanguage()` 于是返回 null AtomicString（platform/language.cc）。Windows
  // 上 `<details>` 会在自己的构造函数里用这个语言查 LCID（locale_win.cc），空指针
  // 直接崩掉渲染进程 —— issue #17 的技能详情页白屏就是这个。这里显式补上，保证
  // 渲染进程始终有非空语言。必须在窗口（也就是渲染进程）创建之前设置。
  app.commandLine.appendSwitch('lang', app.getLocale() || 'en-US')

  await loadDesktopPreferences()
  if (process.platform === 'darwin') app.dock.setIcon(desktopIconPath())

  trayController = new TrayController({
    showWindow: showMainWindow,
    sendCommand: sendTrayCommand,
    quit: quitApplication,
  })
  trayController.setEnabled(getDesktopPreferences().backgroundMode)
  onDesktopPreferencesChanged((preferences) => {
    trayController?.setEnabled(preferences.backgroundMode)
    if (!preferences.backgroundMode) showMainWindow()
  })

  registerIpc(trayController)
  const loginSettings = app.getLoginItemSettings()
  const openedAtLogin =
    process.platform === 'darwin'
      ? loginSettings.wasOpenedAtLogin
      : process.argv.includes('--hidden')
  const launchedHidden =
    getDesktopPreferences().backgroundMode &&
    getDesktopPreferences().launchHidden &&
    openedAtLogin
  createWindow({ showOnReady: !launchedHidden })

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (!getDesktopPreferences().backgroundMode) app.quit()
})

app.on('before-quit', (event) => {
  setQuitting(true)
  disposeMcp?.()
  disposeMcp = undefined
  disposeInstructions?.()
  disposeInstructions = undefined
  if (!hasPendingDesktopPreferenceSaves()) return
  event.preventDefault()
  if (waitingForPreferenceFlush) return
  waitingForPreferenceFlush = true
  void flushDesktopPreferences().finally(() => {
    waitingForPreferenceFlush = false
    app.quit()
  })
})
app.on('will-quit', () => trayController?.dispose())
