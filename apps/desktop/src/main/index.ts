import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  aggregateSkills,
  findSkills,
  getAdapter,
  listPlatformStatus,
  registerPlatform,
  RegistryClient,
  scanInstalledSkills,
  toSkill,
  type Skill,
} from '@skills-manager/core'

const execFileAsync = promisify(execFile)
import type { CustomPlatformInput, InstallTarget, RegistryConfig } from '../shared/ipc.js'

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

  ipcMain.handle('skills:find-in-dir', (_event, root: string) => findSkills(root))

  ipcMain.handle('skills:import-git', async (_event, url: string) => {
    if (!/^(https?:\/\/|git@)[\w.@:/~-]+$/.test(url)) {
      throw new Error(`invalid git url: ${url}`)
    }
    const tmp = await fs.mkdtemp(join(tmpdir(), 'skm-import-'))
    try {
      await execFileAsync('git', ['clone', '--depth', '1', url, tmp], {
        timeout: 60_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      })
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true })
      throw new Error(`git clone failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    return { root: tmp, items: await findSkills(tmp) }
  })

  /* ---------- registry ---------- */

  const clientOf = (cfg: RegistryConfig): RegistryClient =>
    new RegistryClient(cfg.url, cfg.token)

  ipcMain.handle('registry:search', (_event, cfg: RegistryConfig, q?: string) =>
    clientOf(cfg).search(q),
  )

  ipcMain.handle('registry:orgs', (_event, cfg: RegistryConfig) => clientOf(cfg).listOrgs())

  ipcMain.handle(
    'registry:install',
    async (_event, cfg: RegistryConfig, org: string, name: string, targets: InstallTarget[]) => {
      const remote = await clientOf(cfg).getSkill(org, name)
      const skill = await toSkill(remote)
      return runTargets(targets, (t) =>
        getAdapter(t.agent).install(skill, t.scope, t.projectRoot),
      )
    },
  )

  ipcMain.handle('registry:required', (_event, cfg: RegistryConfig, org: string) =>
    clientOf(cfg).requiredSkills(org),
  )

  ipcMain.handle(
    'registry:publish',
    async (_event, cfg: RegistryConfig, org: string, skill: Skill, version: string) => {
      await clientOf(cfg).publish(org, skill, version)
    },
  )

  ipcMain.handle('skills:cleanup-import', async (_event, root: string) => {
    // Only remove dirs we created ourselves.
    if (root.startsWith(join(tmpdir(), 'skm-import-'))) {
      await fs.rm(root, { recursive: true, force: true })
    }
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
