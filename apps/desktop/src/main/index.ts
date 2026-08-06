import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import {
  aggregateSkills,
  getAdapter,
  listPlatformStatus,
  scanInstalledSkills,
  type Skill,
} from '@skills-manager/core'
import type { InstallTarget } from '../shared/ipc.js'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('skills:scan', async () => aggregateSkills(await scanInstalledSkills()))

  ipcMain.handle('platforms:list', () => listPlatformStatus())

  ipcMain.handle(
    'skills:install',
    async (_event, skill: Skill, targets: InstallTarget[]) => {
      const results = await Promise.allSettled(
        targets.map((t) => getAdapter(t.agent).install(skill, t.scope)),
      )
      return results.map((r, i) => ({
        target: targets[i]!,
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : undefined,
      }))
    },
  )

  ipcMain.handle(
    'skills:uninstall',
    async (_event, name: string, targets: InstallTarget[]) => {
      const results = await Promise.allSettled(
        targets.map((t) => getAdapter(t.agent).uninstall(name, t.scope)),
      )
      return results.map((r, i) => ({
        target: targets[i]!,
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : undefined,
      }))
    },
  )

  ipcMain.handle('skills:reveal', (_event, path: string) => {
    shell.showItemInFolder(path)
  })
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
