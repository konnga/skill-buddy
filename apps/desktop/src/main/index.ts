import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import {
  aggregateSkills,
  getAdapter,
  listPlatformStatus,
  registerPlatform,
  scanInstalledSkills,
  type Skill,
} from '@skills-manager/core'
import type { CustomPlatformInput, InstallTarget } from '../shared/ipc.js'

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

async function runTargets(
  targets: InstallTarget[],
  run: (t: InstallTarget) => Promise<unknown>,
): Promise<{ target: InstallTarget; ok: boolean; error?: string }[]> {
  const results = await Promise.allSettled(targets.map(run))
  return results.map((r, i) => ({
    target: targets[i]!,
    ok: r.status === 'fulfilled',
    error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : undefined,
  }))
}

function registerIpc(): void {
  ipcMain.handle('skills:scan', async (_event, projectRoots: string[] = []) =>
    aggregateSkills(await scanInstalledSkills(projectRoots)),
  )

  ipcMain.handle('platforms:list', () => listPlatformStatus())

  ipcMain.handle('platforms:register', (_event, defs: CustomPlatformInput[]) => {
    for (const def of defs) registerPlatform(def)
  })

  ipcMain.handle('skills:install', (_event, skill: Skill, targets: InstallTarget[]) =>
    runTargets(targets, (t) => getAdapter(t.agent).install(skill, t.scope, t.projectRoot)),
  )

  ipcMain.handle('skills:uninstall', (_event, name: string, targets: InstallTarget[]) =>
    runTargets(targets, (t) => getAdapter(t.agent).uninstall(name, t.scope, t.projectRoot)),
  )

  ipcMain.handle('skills:reveal', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('dialog:pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
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
