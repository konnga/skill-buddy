import { app, BrowserWindow } from 'electron'
import { registerAiConversationIpc } from './ai-conversations.js'
import { registerMarketIpc } from './ipc/market.js'
import { registerRegistryIpc } from './ipc/registry.js'
import { registerSkillsIpc } from './ipc/skills.js'
import { PathAccessPolicy } from './path-policy.js'
import { createWindow } from './window.js'

const pathPolicy = new PathAccessPolicy()

function registerIpc(): void {
  registerSkillsIpc(pathPolicy)
  registerAiConversationIpc(pathPolicy)
  registerMarketIpc(pathPolicy)
  registerRegistryIpc(pathPolicy)
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
