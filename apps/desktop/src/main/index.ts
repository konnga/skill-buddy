import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  aggregateSkills,
  findSkills,
  getAdapter,
  listPlatformStatus,
  listSkillRoots,
  registerPlatform,
  RegistryClient,
  scanInstalledSkills,
  toSkill,
  type Skill,
} from '@skillbuddy/core'

const execFileAsync = promisify(execFile)

import { randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, normalize, sep } from 'node:path'
import { unzipSync } from 'fflate'
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

  // The sidebar vibrancy material follows nativeTheme, not the renderer's
  // .dark class — keep them in sync when the in-app theme changes.
  ipcMain.handle('theme:set', (_event, mode: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = mode
  })

  /* ---------- filesystem watching ---------- */

  let watchers: FSWatcher[] = []
  let notifyTimer: ReturnType<typeof setTimeout> | undefined

  /* ---------- encrypted secrets (registry token etc.) ---------- */

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
      // encryptString throws when no OS backend is available (e.g. Linux with
      // no keyring); fail loudly rather than silently persisting plaintext.
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('secure storage unavailable — cannot encrypt secret / 系统加密后端不可用')
      }
      secrets[key] = safeStorage.encryptString(value).toString('base64')
    }
    await fs.writeFile(secretsPath(), JSON.stringify(secrets), 'utf8')
  })

  /* ---------- undoable trash ---------- */

  const undoStash = new Map<string, { root: string; entries: { path: string; stashPath: string }[] }>()

  ipcMain.handle('skills:trash-undoable', async (_event, paths: string[]) => {
    const token = randomUUID()
    const stashRoot = join(app.getPath('userData'), 'undo', token)
    const entries: { path: string; stashPath: string }[] = []
    for (const [i, path] of paths.entries()) {
      const stashPath = join(stashRoot, `${i}-${basename(path)}`)
      await fs.cp(path, stashPath, { recursive: true })
      entries.push({ path, stashPath })
    }
    const results = await Promise.allSettled(paths.map((path) => shell.trashItem(path)))
    undoStash.set(token, { root: stashRoot, entries })
    setTimeout(() => {
      const record = undoStash.get(token)
      if (record) {
        undoStash.delete(token)
        void fs.rm(record.root, { recursive: true, force: true })
      }
    }, 60_000)
    return {
      token,
      results: results.map((r, i) => ({
        path: paths[i]!,
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : undefined,
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

  ipcMain.handle('watch:start', async (_event, projectRoots: string[]) => {
    for (const w of watchers) w.close()
    watchers = []
    const dirs = new Set((await listSkillRoots(projectRoots)).map((root) => root.path))
    const notify = (): void => {
      clearTimeout(notifyTimer)
      notifyTimer = setTimeout(() => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('skills:changed')
        }
      }, 500)
    }
    const addWatch = (target: string, recursive: boolean): void => {
      if (!existsSync(target)) return
      try {
        watchers.push(watch(target, { recursive }, notify))
      } catch {
        // unwatchable dir (permissions etc.) — skip
      }
    }
    for (const dir of dirs) {
      addWatch(dir, true)
      // shallow-watch the parent so a freshly created skills dir (first
      // install on a platform) still triggers a rescan + watcher rebuild
      addWatch(dirname(dir), false)
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

  ipcMain.handle('file:list-tree', async (_event, root: string) => {
    const MAX_ENTRIES = 2000
    const out: { path: string; size: number; isDir: boolean }[] = []
    const walk = async (dir: string, rel: string): Promise<void> => {
      if (out.length >= MAX_ENTRIES) return
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const ent of entries) {
        if (out.length >= MAX_ENTRIES) return
        if (ent.name === '.git' || ent.name === 'node_modules') continue
        const relPath = rel ? `${rel}/${ent.name}` : ent.name
        if (ent.isDirectory()) {
          out.push({ path: relPath, size: 0, isDir: true })
          await walk(join(dir, ent.name), relPath)
        } else if (ent.isFile()) {
          const stat = await fs.stat(join(dir, ent.name))
          out.push({ path: relPath, size: stat.size, isDir: false })
        }
      }
    }
    await walk(root, '')
    return out
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
    try {
      await execFileAsync('git', ['--version'], { timeout: 5_000 })
    } catch {
      throw new Error('git not found — please install Git first / 未检测到 git，请先安装')
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

  /* ---------- AI generation via local agent CLIs ---------- */

  // GUI apps on macOS inherit a minimal PATH; extend it so `claude` etc. resolve
  const CLI_PATH = [
    process.env.PATH ?? '',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(process.env.HOME ?? '', '.local/bin'),
    join(process.env.HOME ?? '', '.bun/bin'),
  ].join(':')

  interface GeneratorDef {
    id: string
    bin: string
    args: (prompt: string) => string[]
    /** pull the assistant's text out of raw stdout */
    extract: (stdout: string) => string
  }

  const GENERATORS: GeneratorDef[] = [
    {
      id: 'claude-code',
      bin: 'claude',
      args: (prompt) => ['-p', prompt, '--output-format', 'json'],
      extract: (stdout) => {
        const parsed = JSON.parse(stdout) as { result?: string }
        return parsed.result ?? ''
      },
    },
    {
      id: 'codex',
      bin: 'codex',
      args: (prompt) => ['exec', '--skip-git-repo-check', prompt],
      extract: (stdout) => stdout,
    },
    {
      id: 'gemini-cli',
      bin: 'gemini',
      args: (prompt) => ['-p', prompt],
      extract: (stdout) => stdout,
    },
  ]

  ipcMain.handle('ai:generators', async () => {
    const results = await Promise.all(
      GENERATORS.map(async (g) => {
        try {
          await execFileAsync('which', [g.bin], { env: { ...process.env, PATH: CLI_PATH } })
          return { id: g.id, available: true }
        } catch {
          return { id: g.id, available: false }
        }
      }),
    )
    return results.filter((r) => r.available).map((r) => r.id)
  })

  ipcMain.handle('ai:generate', async (_event, generatorId: string, prompt: string) => {
    const gen = GENERATORS.find((g) => g.id === generatorId)
    if (!gen) throw new Error(`unknown generator: ${generatorId}`)
    try {
      const { stdout } = await execFileAsync(gen.bin, gen.args(prompt), {
        env: { ...process.env, PATH: CLI_PATH },
        timeout: 240_000,
        maxBuffer: 20 * 1024 * 1024,
        cwd: tmpdir(),
      })
      return { text: gen.extract(stdout) }
    } catch (e) {
      const err = e as Error & { stderr?: string; killed?: boolean }
      if (err.killed) throw new Error('generation timed out (240s)')
      const detail = (err.stderr ?? err.message ?? '').slice(0, 500)
      throw new Error(detail || 'generation failed')
    }
  })

  /* ---------- official bundles ---------- */

  // Renderer CSP is default-src 'self' — remote manifest fetches go through main.
  ipcMain.handle('bundles:manifest', async (_event, url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`bundles manifest ${res.status}`)
    return (await res.json()) as unknown
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

  /* ---------- marketplace (GitHub repositories) ---------- */

  ipcMain.handle('market:github-search', async (_event, q: string, page = 1) => {
    const term = q.trim()
    if (term.length < 2) return { items: [], total: 0 }

    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', `${term} skill in:name,description,readme`)
    url.searchParams.set('page', String(Math.max(1, page)))
    url.searchParams.set('per_page', '24')
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'SkillBuddy',
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      if (res.status === 403) throw new Error('GitHub search rate limit exceeded')
      throw new Error(`GitHub search ${res.status}`)
    }
    const data = (await res.json()) as {
      total_count?: number
      items?: {
        full_name: string
        name: string
        description: string | null
        stargazers_count: number
        updated_at: string | null
        default_branch: string
        owner?: { avatar_url?: string }
        html_url: string
      }[]
    }
    return {
      items: (data.items ?? []).map((repo) => ({
        fullName: repo.full_name,
        name: repo.name,
        description: repo.description ?? '',
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
        avatarUrl: repo.owner?.avatar_url ?? null,
        htmlUrl: repo.html_url,
      })),
      total: Math.min(data.total_count ?? 0, 1000),
    }
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

  ipcMain.handle('market:skillhub-search', async (_event, q: string, page = 1) => {
    const url = new URL('https://api.skillhub.cn/api/skills')
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', '24')
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
          version?: string | null
          updated_at?: number | null
          verified?: boolean
          labels?: { requires_api_key?: string } | null
          subCategories?: { key: string; name: string }[] | null
        }[]
        total?: number
      }
    }
    const items = (data.data?.skills ?? []).map((s) => ({
      slug: s.slug,
      namespace: s.namespace?.handle ?? '',
      canonicalName: s.namespace?.canonicalName ?? s.slug,
      name: s.displayName || s.name,
      description: s.description_zh || s.description || '',
      installs: s.downloads ?? s.installs ?? 0,
      stars: s.stars ?? 0,
      upstreamUrl: s.upstream_url ?? null,
      iconUrl: s.iconUrl ?? null,
      version: s.version ?? null,
      updatedAt: s.updated_at ?? null,
      verified: s.verified ?? false,
      requiresApiKey: s.labels?.requires_api_key === 'true',
      tags: (s.subCategories ?? []).map((c) => c.name),
    }))
    return { items, total: data.data?.total ?? items.length }
  })

  ipcMain.handle('market:skillhub-versions', async (_event, slug: string, namespace: string) => {
    const url = new URL(
      `https://api.skillhub.cn/api/v1/skills/${encodeURIComponent(slug)}/versions`,
    )
    if (namespace) url.searchParams.set('namespace', namespace)
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`skillhub versions ${res.status}`)
    const data = (await res.json()) as {
      versions?: {
        version: string
        changelog?: string
        createdAt?: number
        securityReports?: Record<
          string,
          { status?: string; statusText?: string; reportUrl?: string }
        >
      }[]
    }
    return (data.versions ?? []).map((v) => ({
      version: v.version,
      changelog: v.changelog ?? '',
      createdAt: v.createdAt ?? null,
      security: Object.entries(v.securityReports ?? {}).map(([name, r]) => ({
        name,
        status: r.status ?? '',
        statusText: r.statusText ?? '',
        reportUrl: r.reportUrl ?? '',
      })),
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
        const unpacked = join(tmp, 'unpacked')
        await fs.mkdir(unpacked, { recursive: true })
        // pure-JS extraction (no unzip binary dependency, works on Windows)
        const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
        for (const [rel, data] of Object.entries(files)) {
          if (rel.endsWith('/')) continue
          const safe = normalize(rel)
          // zip-slip guard: reject absolute and parent-escaping entries
          if (isAbsolute(safe) || safe === '..' || safe.startsWith(`..${sep}`)) continue
          const dest = join(unpacked, safe)
          if (dest !== unpacked && !dest.startsWith(unpacked + sep)) continue
          await fs.mkdir(dirname(dest), { recursive: true })
          await fs.writeFile(dest, data)
        }
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
