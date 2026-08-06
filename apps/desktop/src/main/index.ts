import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  aggregateSkills,
  allAdapters,
  findSkills,
  getAdapter,
  listPlatformStatus,
  registerPlatform,
  RegistryClient,
  scanInstalledSkills,
  toSkill,
  type Skill,
} from '@skillbuddy/core'

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
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          backgroundColor: '#00000000',
        }
      : {}),
    // keep the traffic lights vertically centered in the renderer's h-10 title bar
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
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

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })

  /* ---------- filesystem watching ---------- */

  let watchers: FSWatcher[] = []
  let notifyTimer: ReturnType<typeof setTimeout> | undefined

  ipcMain.handle('watch:start', async (_event, projectRoots: string[]) => {
    for (const w of watchers) w.close()
    watchers = []
    const dirs = new Set<string>()
    for (const adapter of allAdapters()) {
      if (!(await adapter.detect())) continue
      const userDir = adapter.skillsDir('user')
      if (userDir) dirs.add(userDir)
      for (const root of projectRoots) {
        const projectDir = adapter.skillsDir('project', root)
        if (projectDir) dirs.add(projectDir)
      }
    }
    for (const dir of dirs) {
      if (!existsSync(dir)) continue
      try {
        const watcher = watch(dir, { recursive: true }, () => {
          clearTimeout(notifyTimer)
          notifyTimer = setTimeout(() => {
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send('skills:changed')
            }
          }, 500)
        })
        watchers.push(watcher)
      } catch {
        // unwatchable dir (permissions etc.) — skip
      }
    }
    return watchers.length
  })

  /* ---------- trash / file preview ---------- */

  ipcMain.handle('skills:trash', async (_event, paths: string[]) => {
    const results = await Promise.allSettled(paths.map((p) => shell.trashItem(p)))
    return results.map((r, i) => ({
      path: paths[i]!,
      ok: r.status === 'fulfilled',
      error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : undefined,
    }))
  })

  const MAX_PREVIEW = 256 * 1024

  ipcMain.handle('file:read', async (_event, path: string) => {
    const stat = await fs.stat(path)
    if (stat.size > MAX_PREVIEW) {
      const handle = await fs.open(path, 'r')
      try {
        const buf = Buffer.alloc(MAX_PREVIEW)
        await handle.read(buf, 0, MAX_PREVIEW, 0)
        return { content: buf.toString('utf8'), truncated: true }
      } finally {
        await handle.close()
      }
    }
    return { content: await fs.readFile(path, 'utf8'), truncated: false }
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

  /* ---------- marketplace (skills.sh) ---------- */

  ipcMain.handle('market:search', async (_event, q: string) => {
    const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`skills.sh ${res.status}`)
    const data = (await res.json()) as {
      skills?: { id: string; skillId: string; name: string; installs: number; source: string }[]
    }
    return (data.skills ?? []).sort((a, b) => b.installs - a.installs)
  })

  /* GitHub stars for skills.sh sources, cached per session */
  const starsCache = new Map<string, number>()

  ipcMain.handle('market:github-stars', async (_event, repos: string[]) => {
    const missing = [...new Set(repos)].filter((r) => !starsCache.has(r)).slice(0, 30)
    await Promise.allSettled(
      missing.map(async (repo) => {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) return
        const data = (await res.json()) as { stargazers_count?: number }
        if (typeof data.stargazers_count === 'number') {
          starsCache.set(repo, data.stargazers_count)
        }
      }),
    )
    const out: Record<string, number> = {}
    for (const repo of repos) {
      const stars = starsCache.get(repo)
      if (stars !== undefined) out[repo] = stars
    }
    return out
  })

  /* ---------- marketplace (skillhub.cn) ---------- */

  ipcMain.handle('market:skillhub-search', async (_event, q: string) => {
    const url = new URL('https://api.skillhub.cn/api/skills')
    url.searchParams.set('page', '1')
    url.searchParams.set('pageSize', '30')
    url.searchParams.set('sortBy', 'score')
    url.searchParams.set('order', 'desc')
    if (q) url.searchParams.set('keyword', q)
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`skillhub ${res.status}`)
    const data = (await res.json()) as {
      data?: {
        skills?: {
          slug: string
          name: string
          displayName?: string
          description?: string
          description_zh?: string
          downloads?: number
          installs?: number
          stars?: number
          namespace?: { handle: string; canonicalName?: string }
          upstream_url?: string | null
          iconUrl?: string | null
        }[]
      }
    }
    return (data.data?.skills ?? []).map((s) => ({
      slug: s.slug,
      namespace: s.namespace?.handle ?? '',
      canonicalName: s.namespace?.canonicalName ?? s.slug,
      name: s.displayName || s.name,
      description: s.description_zh || s.description || '',
      installs: s.downloads ?? s.installs ?? 0,
      stars: s.stars ?? 0,
      upstreamUrl: s.upstream_url ?? null,
      iconUrl: s.iconUrl ?? null,
    }))
  })

  ipcMain.handle(
    'market:skillhub-fetch',
    async (_event, slug: string, namespace: string) => {
      const dl = new URL('https://api.skillhub.cn/api/v1/download')
      dl.searchParams.set('slug', slug)
      if (namespace) dl.searchParams.set('namespace', namespace)
      const res = await fetch(dl, { redirect: 'follow', signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`skillhub download ${res.status}`)
      const tmp = await fs.mkdtemp(join(tmpdir(), 'skm-import-'))
      try {
        const zipPath = join(tmp, 'skill.zip')
        await fs.writeFile(zipPath, Buffer.from(await res.arrayBuffer()))
        const unpacked = join(tmp, 'unpacked')
        await fs.mkdir(unpacked, { recursive: true })
        await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', unpacked], {
          timeout: 30_000,
        })
        return { root: tmp, items: await findSkills(unpacked) }
      } catch (e) {
        await fs.rm(tmp, { recursive: true, force: true })
        throw e
      }
    },
  )

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

  ipcMain.handle('registry:get', (_event, cfg: RegistryConfig, org: string, name: string) =>
    clientOf(cfg).getSkill(org, name),
  )

  ipcMain.handle('registry:versions', (_event, cfg: RegistryConfig, org: string, name: string) =>
    clientOf(cfg).listVersions(org, name),
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
