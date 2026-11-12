import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  MCP_PACKAGE_LIMITS as limits,
  type McpPackageCandidate,
  type McpPackageIssueCode,
  type McpPackageSnapshot,
  type McpPackageSource,
} from '../../../shared/mcp-packages'

const PACKAGE_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const EXECUTABLE = /^[a-z0-9][a-z0-9._-]*$/i
const EXCLUDED_PACKAGES = new Set(['@modelcontextprotocol/sdk', '@modelcontextprotocol/inspector'])

interface NpmLocations {
  cache: string
  globalRoot?: string
  queryFailed?: boolean
}

export interface PackageScanOptions {
  projectRoots: string[]
  signal: AbortSignal
  onProgress?: (snapshot: McpPackageSnapshot) => void
  /** 测试可使用临时目录，避免调用测试机上的 npm。 */
  locations?: NpmLocations
  home?: string
  maxPackages?: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function missing(error: unknown): boolean {
  return record(error) && error.code === 'ENOENT'
}

/** npm 不可用时仍可检查用户配置的缓存，Windows 使用系统 LocalAppData 目录。 */
function fallbackCache(home: string): string {
  const configured = process.env.npm_config_cache ?? process.env.NPM_CONFIG_CACHE
  if (configured && configured.length <= 4096 && isAbsolute(configured) && !/[\r\n\0]/.test(configured)) return resolve(configured)
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'npm-cache')
    : join(home, '.npm')
}

/** 调用已安装的 Node/npm 查询路径；不执行包入口，不查询远程注册表。 */
async function npmLocations(home: string, signal: AbortSignal): Promise<NpmLocations | null> {
  const directories = [...new Set([
    ...(process.env.PATH ?? process.env.Path ?? '').split(delimiter),
    process.env.NVM_BIN,
    process.env.VOLTA_HOME && join(process.env.VOLTA_HOME, 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'),
  ].filter((value): value is string => Boolean(value) && isAbsolute(value!)))]
  let node: string | undefined
  let npmCli: string | undefined
  for (const directory of directories.slice(0, 128)) {
    signal.throwIfAborted()
    if (!node) {
      const path = join(directory, process.platform === 'win32' ? 'node.exe' : 'node')
      if (await fs.stat(path).then((stat) => stat.isFile(), () => false)) node = path
    }
    if (!npmCli) {
      const paths = [join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js')]
      if (process.platform !== 'win32') {
        const npm = await fs.realpath(join(directory, 'npm')).catch(() => '')
        if (npm.endsWith(`${sep}npm-cli.js`)) paths.unshift(npm)
      }
      for (const path of paths) {
        if (await fs.stat(path).then((stat) => stat.isFile(), () => false)) {
          npmCli = path
          break
        }
      }
    }
    if (node && npmCli) break
  }
  if (!node || !npmCli) return null
  const query = (args: string[]) => new Promise<string>((accept, reject) => {
    execFile(node!, ['--max-old-space-size=64', npmCli!, '--logs-max=0', '--loglevel=silent', ...args], {
      cwd: home, signal, timeout: limits.npmTimeoutMs, maxBuffer: 16 * 1024,
      windowsHide: true, encoding: 'utf8',
    }, (error, stdout) => {
      const value = stdout.trim()
      if (error || !value || value.length > 4096 || !isAbsolute(value) || /[\r\n\0]/.test(value)) {
        reject(new Error('npm-query-failed'))
      } else accept(resolve(value))
    })
  })
  const [cache, globalRoot] = await Promise.allSettled([
    query(['config', 'get', 'cache']), query(['root', '-g']),
  ])
  signal.throwIfAborted()
  return {
    cache: cache.status === 'fulfilled' ? cache.value : fallbackCache(home),
    ...(globalRoot.status === 'fulfilled' ? { globalRoot: globalRoot.value } : {}),
    queryFailed: cache.status === 'rejected' || globalRoot.status === 'rejected',
  }
}

/** 静态扫描顶层包；一个文件失败只记录问题，所有读取均有数量和大小上限。 */
export async function scanMcpPackages(options: PackageScanOptions): Promise<McpPackageSnapshot> {
  const home = resolve(options.home ?? homedir())
  const state: McpPackageSnapshot = {
    candidates: [], issues: [], scannedPackages: 0, stage: 'global', limited: false,
  }
  let visitedEntries = 0
  let workLimitReached = false
  const seen = new Set<string>()
  const inspected = new Set<string>()
  const packageLimit = Math.min(options.maxPackages ?? limits.packages, limits.packages)
  let lastProgressAt = 0
  const progress = (force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressAt < 100) return
    lastProgressAt = now
    options.onProgress?.({ ...state, candidates: [...state.candidates], issues: [...state.issues] })
  }
  const issue = (code: McpPackageIssueCode, path?: string) => {
    if (state.issues.length < limits.issues) state.issues.push({ code, ...(path ? { path: path.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 1024) } : {}) })
  }
  const full = () => {
    options.signal.throwIfAborted()
    if (!workLimitReached && state.scannedPackages < packageLimit && state.candidates.length < limits.candidates) return false
    state.limited = true
    return true
  }

  /** 按文件句柄分块读取，避免文件在 stat 后增长而绕过大小上限。 */
  const manifest = async (path: string): Promise<Record<string, unknown> | null> => {
    options.signal.throwIfAborted()
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined
    try {
      handle = await fs.open(path, 'r')
      const stat = await handle.stat()
      if (!stat.isFile()) return null
      if (stat.size > limits.manifestBytes) { issue('file-too-large', path); return null }
      const buffer = Buffer.alloc(limits.manifestBytes + 1)
      let length = 0
      while (length < buffer.length) {
        options.signal.throwIfAborted()
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
        if (!bytesRead) break
        length += bytesRead
      }
      if (length > limits.manifestBytes) { issue('file-too-large', path); return null }
      try {
        const value: unknown = JSON.parse(buffer.subarray(0, length).toString('utf8').replace(/^\uFEFF/, ''))
        if (record(value)) return value
      } catch { /** 解析失败统一使用结构化错误，不返回文件内容。 */ }
      issue('invalid-manifest', path)
    } catch (error) {
      if (options.signal.aborted) options.signal.throwIfAborted()
      if (!missing(error)) issue('read-failed', path)
    } finally { await handle?.close().catch(() => undefined) }
    return null
  }

  const inspect = async (path: string, source: McpPackageSource, projectRoot?: string) => {
    if (full()) return
    if (++visitedEntries > limits.directoryEntries) { workLimitReached = true; state.limited = true; return }
    const real = await fs.realpath(path).catch((error: unknown) => {
      if (!missing(error)) issue('read-failed', path)
      return ''
    })
    if (!real) return
    if (real.length > 4096 || /[\u0000-\u001f\u007f]/.test(real)) { issue('read-failed', path); return }
    const identity = `${source}\0${projectRoot ?? ''}\0${real}`
    if (inspected.has(identity)) return
    inspected.add(identity)
    state.scannedPackages++
    if (state.scannedPackages % 25 === 0) progress()
    const pkg = await manifest(join(real, 'package.json'))
    if (!pkg) return
    const name = pkg.name
    const version = pkg.version
    if (typeof name !== 'string' || name.length > 214 || !PACKAGE_NAME.test(name) ||
      typeof version !== 'string' || version.length > 128 || !VERSION.test(version) || EXCLUDED_PACKAGES.has(name)) return
    const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.filter((entry): entry is string => typeof entry === 'string') : []
    const declared = typeof pkg.mcpName === 'string' && pkg.mcpName.length > 0
    const hints = [name, ...keywords].join(' ').replaceAll('_', '-')
    const description = typeof pkg.description === 'string' ? pkg.description : ''
    const inferred = /(?:\bmcp\b|model[\s-]+context[\s-]+protocol)/i.test(hints) ||
      /^@modelcontextprotocol\/server-/i.test(name) ||
      /(?:\bmcp[\s-]+server\b|model[\s-]+context[\s-]+protocol[\s-]+server)/i.test(description)
    if (!declared && !inferred) return
    const bins = typeof pkg.bin === 'string' ? { [name.split('/').at(-1)!]: pkg.bin } : record(pkg.bin) ? pkg.bin : {}
    for (const [executable, target] of Object.entries(bins).slice(0, 8)) {
      if (!EXECUTABLE.test(executable) || executable.length > 128 || typeof target !== 'string' || !target || target.includes('\0') || isAbsolute(target)) continue
      const rel = relative(real, resolve(real, target))
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue
      if (!await fs.stat(resolve(real, target)).then((stat) => stat.isFile(), () => false)) continue
      const key = `${source}\0${projectRoot ?? ''}\0${name}@${version}\0${executable}`
      if (seen.has(key) || state.candidates.length >= limits.candidates) continue
      seen.add(key)
      const unscoped = name.split('/').at(-1)!
      const serverName = unscoped.replace(/^(?:mcp-server-|server-|mcp-)/, '').slice(0, 128)
      const candidate: McpPackageCandidate = {
        id: createHash('sha256').update(key).digest('hex').slice(0, 24),
        packageName: name, version, executable, source, location: real,
        ...(projectRoot ? { projectRoot } : {}), evidence: declared ? 'declared' : 'inferred',
        definition: {
          name: serverName || executable,
          transport: {
            kind: 'stdio', command: 'npx', args: ['-y', `--package=${name}@${version}`, '--', executable],
            ...(projectRoot ? { cwd: projectRoot } : {}), env: {},
          },
          requiredSecrets: [],
        },
      }
      const prospective = { ...state, candidates: [...state.candidates, candidate] }
      if (Buffer.byteLength(JSON.stringify(prospective), 'utf8') > limits.messageBytes - (limits.issues * 4096 + 4096)) {
        workLimitReached = true
        state.limited = true
        return
      }
      state.candidates.push(candidate)
      progress(state.candidates.length === 1)
    }
    if (state.scannedPackages % 25 === 0) progress()
  }

  /** 流式枚举目录，不把整个 node_modules 或缓存目录一次性读入内存。 */
  const entries = async (directory: string, visit: (path: string, name: string) => Promise<void>, count: number = limits.directoryEntries) => {
    try {
      const handle = await fs.opendir(directory)
      let visited = 0
      for await (const entry of handle) {
        if (full()) break
        if (++visited > count) { state.limited = true; break }
        if (++visitedEntries > limits.directoryEntries) { workLimitReached = true; state.limited = true; break }
        if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith('.')) continue
        await visit(join(directory, entry.name), entry.name)
      }
    } catch (error) {
      if (options.signal.aborted) options.signal.throwIfAborted()
      if (!missing(error)) issue('read-failed', directory)
    }
  }
  const modules = (directory: string, source: McpPackageSource) => entries(directory, async (path, name) => {
    if (name.startsWith('@')) await entries(path, (scoped) => inspect(scoped, source))
    else await inspect(path, source)
  })

  let locations = options.locations
  if (!locations) {
    try {
      locations = await npmLocations(home, options.signal) ?? undefined
      if (!locations) issue('npm-unavailable')
      else if (locations.queryFailed) issue('npm-query-failed')
    } catch {
      options.signal.throwIfAborted()
      issue('npm-query-failed')
    }
  }
  locations ??= { cache: fallbackCache(home) }
  progress(true)
  if (locations.globalRoot) await modules(locations.globalRoot, 'global')
  state.stage = 'npx'
  progress(true)
  await entries(join(locations.cache, '_npx'), async (path) => {
    const root = await manifest(join(path, 'package.json'))
    if (!root) return
    const requested = record(root._npx) && Array.isArray(root._npx.packages) ? root._npx.packages : []
    const dependencies = record(root.dependencies) ? Object.keys(root.dependencies) : []
    const names = requested.length ? requested.filter((name): name is string => typeof name === 'string').map((spec) => spec.replace(/@[^/@]*$/, '')) : dependencies
    for (const name of names.slice(0, 128)) {
      if (full()) break
      if (PACKAGE_NAME.test(name)) await inspect(join(path, 'node_modules', name), 'npx')
    }
  }, limits.cacheEntries)
  state.stage = 'project'
  progress(true)
  const roots = [...new Set(options.projectRoots)].slice(0, limits.projects)
  if (options.projectRoots.length > limits.projects) state.limited = true
  for (const rawRoot of roots) {
    if (full()) break
    if (!isAbsolute(rawRoot)) continue
    const root = await fs.realpath(rawRoot).catch((error: unknown) => {
      if (!missing(error)) issue('read-failed', rawRoot)
      return ''
    })
    if (!root || root === home || dirname(root) === root) continue
    if (root.length > 4096 || /[\u0000-\u001f\u007f]/.test(root)) { issue('read-failed', rawRoot); continue }
    const pkg = await manifest(join(root, 'package.json'))
    if (!pkg) continue
    const dependencies = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
      .flatMap((field) => record(pkg[field]) ? Object.keys(pkg[field]) : []))
    for (const name of dependencies) {
      if (full()) break
      if (!PACKAGE_NAME.test(name)) continue
      let directory = root
      for (let depth = 0; depth < 12 && directory !== home && dirname(directory) !== directory; depth++) {
        options.signal.throwIfAborted()
        if (++visitedEntries > limits.directoryEntries) { workLimitReached = true; state.limited = true; break }
        const path = join(directory, 'node_modules', name)
        if (await fs.stat(path).then((stat) => stat.isDirectory(), () => false)) {
          await inspect(path, 'project', root)
          break
        }
        directory = dirname(directory)
      }
    }
  }
  progress(true)
  return state
}
