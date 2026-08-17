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
import { PathAccessPolicy } from './path-policy.js'
import {
  getDesktopPreferences,
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
let trayController: TrayController | undefined

function registerIpc(tray: TrayController): void {
  registerSkillsIpc(pathPolicy)
  registerBackupIpc(pathPolicy)
  registerAiConversationIpc(pathPolicy)
  registerBrowserIpc()
  registerSystemIpc()
  registerMarketIpc(pathPolicy)
  registerMcpMarketIpc()
  registerTeamLibraryIpc(pathPolicy)
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

app.on('before-quit', () => {
  setQuitting(true)
  disposeMcp?.()
})
app.on('will-quit', () => trayController?.dispose())
