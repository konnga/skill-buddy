import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  shell,
} from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  aggregateSkills,
  findSkills,
  getAdapter,
  listPlatformStatus,
  listSkillRoots,
  registerPlatform,
  scanInstalledSkills,
  type Skill,
} from '@skillbuddy/core'
import type { CustomPlatformInput, InstallTarget } from '../../shared/ipc.js'
import { PathAccessPolicy, validateCustomPlatform } from '../path-policy.js'
import { installTarget, runTargets } from './targets.js'

const execFileAsync = promisify(execFile)

/** 切换 Skill 状态，并兼容尚未包含此能力的旧 Adapter 实例。 */
async function setAdapterEnabled(
  name: string,
  enabled: boolean,
  target: InstallTarget,
): Promise<void> {
  const adapter = getAdapter(target.agent)
  if (typeof adapter.setEnabled === 'function') {
    await adapter.setEnabled(name, enabled, target.scope, target.projectRoot)
    return
  }

  const root = adapter.skillsDir(target.scope, target.projectRoot)
  if (!root) throw new Error(`${target.agent}: no skills directory for scope "${target.scope}"`)
  const skillPath = join(root, name)
  const activePath = join(skillPath, 'SKILL.md')
  const disabledPath = join(skillPath, 'SKILL.md.disabled')
  if (enabled) {
    if (existsSync(activePath)) {
      await fs.rm(disabledPath, { force: true })
      return
    }
    if (!existsSync(disabledPath)) throw new Error(`skill not found: ${name}`)
    await fs.rename(disabledPath, activePath)
    return
  }
  if (existsSync(disabledPath)) {
    await fs.rm(activePath, { force: true })
    return
  }
  if (!existsSync(activePath)) throw new Error(`skill not found: ${name}`)
  await fs.rename(activePath, disabledPath)
}

/** 注册本地 Skill、文件系统、设置和导入相关 IPC。 */
export function registerSkillsIpc(pathPolicy: PathAccessPolicy): void {
  ipcMain.handle('skills:scan', async (_event, projectRoots: string[] = []) => {
    pathPolicy.setSkillRoots(await listSkillRoots(projectRoots))
    return await aggregateSkills(await scanInstalledSkills(projectRoots))
  })

  ipcMain.handle('platforms:list', () => listPlatformStatus())

  ipcMain.handle('platforms:register', (_event, definitions: CustomPlatformInput[]) => {
    for (const definition of definitions) registerPlatform(validateCustomPlatform(definition))
  })

  ipcMain.handle('skills:install', async (_event, skill: Skill, targets: InstallTarget[]) => {
    await pathPolicy.assertSkillResources(skill)
    return runTargets(targets, (target) => installTarget(skill, target, pathPolicy))
  })

  ipcMain.handle('skills:uninstall', (_event, name: string, targets: InstallTarget[]) =>
    runTargets(targets, (target) => {
      const adapter = getAdapter(target.agent)
      const root = adapter.skillsDir(target.scope, target.projectRoot)
      if (!root) throw new Error(`${target.agent}: no skills directory for scope "${target.scope}"`)
      pathPolicy.assertWritableTargetRoot(root)
      return adapter.uninstall(name, target.scope, target.projectRoot)
    }),
  )

  ipcMain.handle(
    'skills:set-enabled',
    async (_event, name: string, targets: InstallTarget[], enabled: boolean) =>
      runTargets(targets, async (target) => {
        const adapter = getAdapter(target.agent)
        const targetRoot = adapter.skillsDir(target.scope, target.projectRoot)
        if (!targetRoot) {
          throw new Error(`${target.agent}: no skills directory for scope "${target.scope}"`)
        }
        pathPolicy.assertWritableTargetRoot(targetRoot)
        const roots = target.scope === 'project' && target.projectRoot ? [target.projectRoot] : []
        const installation = (await scanInstalledSkills(roots)).find(
          (item) =>
            item.skill.name === name &&
            item.agent === target.agent &&
            item.scope === target.scope &&
            (item.projectRoot ?? '') === (target.projectRoot ?? ''),
        )
        if (!installation) throw new Error(`skill installation not found: ${name}`)
        if (installation.readOnly) throw new Error('skill installation is read-only')
        return setAdapterEnabled(name, enabled, target)
      }),
  )

  ipcMain.handle('skills:reveal', async (_event, path: string) => {
    await pathPolicy.assertReadable(path)
    shell.showItemInFolder(path)
  })

  ipcMain.handle('shell:open-external', (_event, value: string) => {
    if (/^https?:\/\//.test(value)) return shell.openExternal(value)
  })

  ipcMain.handle('theme:set', (_event, mode: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = mode
  })

  const secretsPath = (): string => join(app.getPath('userData'), 'secrets.json')
  async function readSecrets(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await fs.readFile(secretsPath(), 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  ipcMain.handle('secure:get', async (_event, key: string) => {
    const encrypted = (await readSecrets())[key]
    if (!encrypted) return ''
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return ''
    }
  })

  ipcMain.handle('secure:set', async (_event, key: string, value: string) => {
    const secrets = await readSecrets()
    if (!value) {
      delete secrets[key]
    } else {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('secure storage unavailable - cannot encrypt secret / 系统加密后端不可用')
      }
      secrets[key] = safeStorage.encryptString(value).toString('base64')
    }
    await fs.writeFile(secretsPath(), JSON.stringify(secrets), 'utf8')
  })

  const undoStash = new Map<
    string,
    { root: string; entries: { path: string; stashPath: string }[] }
  >()

  ipcMain.handle('skills:trash-undoable', async (_event, paths: string[]) => {
    await Promise.all(paths.map((path) => pathPolicy.assertWritableSkillDirectory(path)))
    const token = randomUUID()
    const stashRoot = join(app.getPath('userData'), 'undo', token)
    const entries: { path: string; stashPath: string }[] = []
    for (const [index, path] of paths.entries()) {
      const stashPath = join(stashRoot, `${index}-${basename(path)}`)
      await fs.cp(path, stashPath, { recursive: true })
      entries.push({ path, stashPath })
    }
    const settled = await Promise.allSettled(paths.map((path) => shell.trashItem(path)))
    undoStash.set(token, { root: stashRoot, entries })
    setTimeout(() => {
      const record = undoStash.get(token)
      if (!record) return
      undoStash.delete(token)
      void fs.rm(record.root, { recursive: true, force: true })
    }, 60_000)
    return {
      token,
      results: settled.map((result, index) => ({
        path: paths[index]!,
        ok: result.status === 'fulfilled',
        error:
          result.status === 'rejected'
            ? String(result.reason?.message ?? result.reason)
            : undefined,
      })),
    }
  })

  ipcMain.handle('skills:undo-trash', async (_event, token: string) => {
    const record = undoStash.get(token)
    if (!record) return false
    undoStash.delete(token)
    for (const entry of record.entries) {
      await fs.cp(entry.stashPath, entry.path, { recursive: true })
    }
    await fs.rm(record.root, { recursive: true, force: true })
    return true
  })

  let watchers: FSWatcher[] = []
  let notifyTimer: ReturnType<typeof setTimeout> | undefined
  ipcMain.handle('watch:start', async (_event, projectRoots: string[]) => {
    for (const watcher of watchers) watcher.close()
    watchers = []
    const roots = await listSkillRoots(projectRoots)
    pathPolicy.setSkillRoots(roots)
    const directories = new Set(roots.map((root) => root.path))
    const notify = (): void => {
      clearTimeout(notifyTimer)
      notifyTimer = setTimeout(() => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send('skills:changed')
        }
      }, 500)
    }
    const addWatch = (target: string, recursive: boolean): void => {
      if (!existsSync(target)) return
      try {
        watchers.push(watch(target, { recursive }, notify))
      } catch {
        return
      }
    }
    for (const directory of directories) {
      addWatch(directory, true)
      addWatch(dirname(directory), false)
    }
    return watchers.length
  })

  ipcMain.handle('skills:trash', async (_event, paths: string[]) => {
    await Promise.all(paths.map((path) => pathPolicy.assertWritableSkillDirectory(path)))
    const settled = await Promise.allSettled(paths.map((path) => shell.trashItem(path)))
    return settled.map((result, index) => ({
      path: paths[index]!,
      ok: result.status === 'fulfilled',
      error:
        result.status === 'rejected'
          ? String(result.reason?.message ?? result.reason)
          : undefined,
    }))
  })

  const maxPreviewBytes = 256 * 1024
  ipcMain.handle('file:read', async (_event, path: string) => {
    await pathPolicy.assertReadable(path)
    const stat = await fs.stat(path)
    if (stat.size > maxPreviewBytes) {
      const handle = await fs.open(path, 'r')
      try {
        const buffer = Buffer.alloc(maxPreviewBytes)
        await handle.read(buffer, 0, maxPreviewBytes, 0)
        return { content: buffer.toString('utf8'), truncated: true }
      } finally {
        await handle.close()
      }
    }
    return { content: await fs.readFile(path, 'utf8'), truncated: false }
  })

  ipcMain.handle('file:list-tree', async (_event, root: string) => {
    await pathPolicy.assertReadable(root)
    const maxEntries = 2000
    const output: { path: string; size: number; isDir: boolean }[] = []
    const walk = async (directory: string, prefix: string): Promise<void> => {
      if (output.length >= maxEntries) return
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (output.length >= maxEntries) return
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          output.push({ path: relativePath, size: 0, isDir: true })
          await walk(join(directory, entry.name), relativePath)
        } else if (entry.isFile()) {
          const stat = await fs.stat(join(directory, entry.name))
          output.push({ path: relativePath, size: stat.size, isDir: false })
        }
      }
    }
    await walk(root, '')
    return output
  })

  ipcMain.handle('dialog:pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    const selected = result.canceled ? null : (result.filePaths[0] ?? null)
    if (selected) pathPolicy.grantSelectedRoot(selected)
    return selected
  })

  ipcMain.handle('skills:find-in-dir', async (_event, root: string) => {
    await pathPolicy.assertReadable(root)
    return findSkills(root)
  })

  ipcMain.handle('skills:import-git', async (_event, url: string) => {
    if (!/^(https?:\/\/|git@)[\w.@:/~-]+$/.test(url)) {
      throw new Error(`invalid git url: ${url}`)
    }
    try {
      await execFileAsync('git', ['--version'], { timeout: 5_000 })
    } catch {
      throw new Error('git not found - please install Git first / 未检测到 git，请先安装')
    }
    const root = await fs.mkdtemp(join(tmpdir(), 'skm-import-'))
    pathPolicy.grantTemporaryRoot(root, true)
    try {
      await execFileAsync('git', ['clone', '--depth', '1', url, root], {
        timeout: 60_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      })
    } catch (error) {
      pathPolicy.revokeTemporaryRoot(root)
      await fs.rm(root, { recursive: true, force: true })
      throw new Error(`git clone failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return { root, items: await findSkills(root) }
  })

  ipcMain.handle('skills:cleanup-import', async (_event, root: string) => {
    pathPolicy.assertTemporaryRoot(root)
    pathPolicy.revokeTemporaryRoot(root)
    await fs.rm(root, { recursive: true, force: true })
  })
}
