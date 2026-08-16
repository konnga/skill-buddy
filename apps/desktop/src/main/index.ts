import { app, BrowserWindow } from 'electron'
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
import { createWindow } from './window.js'

const pathPolicy = new PathAccessPolicy()
let disposeMcp: (() => void) | undefined

function registerIpc(): void {
  registerSkillsIpc(pathPolicy)
  registerBackupIpc(pathPolicy)
  registerAiConversationIpc(pathPolicy)
  registerBrowserIpc()
  registerSystemIpc()
  registerMarketIpc(pathPolicy)
  registerMcpMarketIpc()
  registerTeamLibraryIpc(pathPolicy)
  const mcpService = registerMcpIpc()
  disposeMcp = () => mcpService.dispose()
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => disposeMcp?.())
