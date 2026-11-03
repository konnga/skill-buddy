import { createHash } from 'node:crypto'
import { constants, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { INSTRUCTION_PROFILES } from './profiles.js'
import { instructionEffectiveDirectory, normalizedPath } from './paths.js'
import { MAX_INSTRUCTION_FILE_BYTES } from './constants.js'
import type { InstructionBinding, InstructionDirectory, InstructionDocument, InstructionDiagnostic, InstructionImportRef, InstructionKind, InstructionScanResult } from './types.js'

/** 扫描与文件监听共用的目录排除集，元素均为小写。 */
export const INSTRUCTION_SCAN_EXCLUDES: ReadonlySet<string> = new Set(['.git', '.cache', '.next', '.nuxt', '.output', '.pnpm-store', '.turbo', '.vite', 'build', 'coverage', 'dist', 'node_modules', 'out', 'temp', 'tmp'])
const MAX_DEPTH = 12
export { MAX_INSTRUCTION_FILE_BYTES } from './constants.js'

function kindForName(name: string): InstructionKind {
  if (name.toLowerCase() === 'agents.md') return 'agents'
  if (name.toLowerCase() === 'claude.md') return 'claude'
  if (name.toLowerCase() === 'gemini.md') return 'gemini'
  return 'custom'
}

function hash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

const IMPORT_LINE_PATTERN = /^\s*@([^\s@]+)\s*$/
const IMPORT_FILE_EXTENSION_PATTERN = /\.(?:md|mdc|markdown|txt)$/i

/**
 * 解析指令文件中的 Markdown 导入引用（Claude Code 的 `@path` 语法）。
 *
 * 只识别独占一行的 `@path`，并要求 token 带已知扩展名或以 `./`、`../`、`~/`、`/` 开头，
 * 以此排除正文里出现的邮箱地址。路径按声明文件所在目录解析，`root` 为该文件的访问边界；
 * 越界引用不进行存在性探测，直接标记为 `escapesRoot`，交由诊断层报 `invalid-import`。
 */
async function parseImports(content: string, fileDirectory: string, root: string | undefined): Promise<InstructionImportRef[]> {
  const refs: InstructionImportRef[] = []
  const seen = new Set<string>()
  for (const line of content.split(/\r?\n/)) {
    const raw = IMPORT_LINE_PATTERN.exec(line)?.[1]
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    if (raw.includes('://')) continue
    const pathLike = raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/')
      || raw.startsWith('~/') || IMPORT_FILE_EXTENSION_PATTERN.test(raw)
    if (!pathLike) continue
    const target = resolve(fileDirectory, raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw)
    const escapesRoot = root !== undefined && target !== root && !target.startsWith(`${root}${sep}`)
    const exists = !escapesRoot && await fs.stat(target).then((item) => item.isFile(), () => false)
    refs.push({ raw, target, exists, escapesRoot })
  }
  return refs
}

function candidateNames(): Set<string> {
  const names = new Set<string>()
  for (const profile of INSTRUCTION_PROFILES) {
    profile.projectFileCandidates.forEach((name) => names.add(basename(name)))
    profile.projectFallbacks.forEach((name) => names.add(basename(name)))
    profile.localOverlayCandidates.forEach((name) => names.add(basename(name)))
    profile.overrideCandidates?.forEach((name) => names.add(basename(name)))
  }
  return names
}

function matchesCandidate(path: string, projectRoot: string | undefined, candidate: string): boolean {
  const normalizedCandidate = normalizedPath(candidate)
  if (!normalizedCandidate.includes('/')) return basename(path) === candidate
  if (!projectRoot) return false
  const relativePath = normalizedPath(relative(projectRoot, path))
  return relativePath === normalizedCandidate || relativePath.endsWith(`/${normalizedCandidate}`)
}

function matchesRulesDirectory(path: string, projectRoot: string | undefined, candidate: string): boolean {
  if (!projectRoot) return false
  const relativeDirectory = normalizedPath(relative(projectRoot, dirname(path)))
  const normalizedCandidate = normalizedPath(candidate).replace(/\/$/, '')
  return relativeDirectory === normalizedCandidate || relativeDirectory.endsWith(`/${normalizedCandidate}`)
}

function bindingForDocument(path: string, scope: 'user' | 'project', projectRoot?: string): InstructionBinding[] {
  return INSTRUCTION_PROFILES.flatMap((profile) => {
    const matchedRulesDirectory = (profile.rulesDirCandidates ?? []).find((item) =>
      matchesRulesDirectory(path, projectRoot, item),
    )
    const primary = scope === 'user'
      ? profile.globalPaths.some((item) => resolve(item) === resolve(path))
      : [...profile.projectFileCandidates, ...profile.localOverlayCandidates, ...(profile.overrideCandidates ?? [])].some((item) => matchesCandidate(path, projectRoot, item))
        || matchedRulesDirectory !== undefined
    const fallback = scope === 'project'
      && profile.projectFallbacks.some((item) => matchesCandidate(path, projectRoot, item))
    const unsupported = scope === 'project'
      && ['workbuddy', 'workbuddy-ai'].includes(profile.key.productId)
      && basename(path).toLowerCase() === 'agents.md'
    const requiresConfig = scope === 'project' && (
      (profile.key.productId === 'gemini-cli' && basename(path).toLowerCase() === 'agents.md')
      || (
        profile.key.productId === 'grok-build'
        && (
          fallback
          || matchedRulesDirectory === '.claude/rules'
          || matchedRulesDirectory === '.cursor/rules'
        )
      )
    )
    const matches = primary || fallback || unsupported
    if (!matches) return []
    return [{
      surface: profile.key,
      role: unsupported
        ? 'unsupported'
        : requiresConfig
          ? 'requires-config'
          : !primary && fallback
            ? 'fallback'
            : 'primary',
      status: 'ok',
    }]
  })
}

function applyFallbackShadowing(documents: InstructionDocument[]): void {
  for (const profile of INSTRUCTION_PROFILES) {
    const directories = new Map<string, InstructionDocument[]>()
    for (const document of documents.filter((item) => item.scope === 'project')) {
      const directory = instructionEffectiveDirectory(document, profile)
      const list = directories.get(directory) ?? []
      list.push(document)
      directories.set(directory, list)
    }
    for (const items of directories.values()) {
      const primary = items.find((document) => document.bindings.some((binding) =>
        binding.surface.vendorId === profile.key.vendorId
        && binding.surface.productId === profile.key.productId
        && binding.surface.surfaceId === profile.key.surfaceId
        && binding.role === 'primary',
      ))
      if (!primary) continue
      for (const document of items) {
        document.bindings = document.bindings.map((binding) => {
          const sameSurface = binding.surface.vendorId === profile.key.vendorId
            && binding.surface.productId === profile.key.productId
            && binding.surface.surfaceId === profile.key.surfaceId
          return sameSurface && binding.role === 'fallback'
            ? { ...binding, role: 'shadowed', shadowedBy: primary.path }
            : binding
        })
      }
    }
  }
}

function applyClaudeBridgeConflicts(documents: InstructionDocument[]): void {
  const directories = new Map<string, InstructionDocument[]>()
  for (const document of documents.filter((item) => item.scope === 'project')) {
    const directory = dirname(document.path)
    const items = directories.get(directory) ?? []
    items.push(document)
    directories.set(directory, items)
  }
  for (const items of directories.values()) {
    const agents = items.find((document) => document.fileName === 'AGENTS.md')
    const claude = items.find((document) => document.fileName === 'CLAUDE.md')
    if (!agents || !claude) continue
    claude.bindings = claude.bindings.map((binding) => {
      const isClaude = binding.surface.vendorId === 'anthropic'
        && binding.surface.productId === 'claude-code'
      return isClaude && binding.status !== 'bridged'
        ? { ...binding, status: 'conflict' }
        : binding
    })
  }
}

async function readDocument(path: string, scope: 'user' | 'project', projectRoot: string | undefined, rootForLink: string | undefined): Promise<InstructionDocument | null> {
  const entry = await fs.lstat(path).catch(() => null)
  if (!entry || (!entry.isFile() && !entry.isSymbolicLink())) return null
  const linked = entry.isSymbolicLink()
  const linkTarget = linked ? await fs.readlink(path).catch(() => undefined) : undefined
  const realPath = await fs.realpath(path).catch(() => null)
  const linkBroken = linked && realPath === null
  const allowedLink = !linked || !rootForLink || (realPath !== null && (realPath === rootForLink || realPath.startsWith(`${rootForLink}${sep}`)))
  const invalidLink = linkBroken || !allowedLink
  const readablePath = realPath ?? path
  const stat = await fs.stat(readablePath).catch(() => entry)
  const contentTruncated = stat.size > MAX_INSTRUCTION_FILE_BYTES
  const content = allowedLink && !contentTruncated ? await fs.readFile(readablePath).catch(() => null) : null
  if (!content) {
    return {
      id: path,
      kind: kindForName(basename(path)),
      fileName: basename(path),
      path,
      scope,
      ...(projectRoot ? { projectRoot, relativeDirectory: relative(projectRoot, dirname(path)) || '.' } : {}),
      bindings: bindingForDocument(path, scope, projectRoot).map((binding) => ({ ...binding, status: invalidLink ? 'link-broken' : 'read-only' })),
      contentHash: '',
      modifiedAt: stat.mtimeMs,
      size: stat.size,
      readOnly: true,
      linked,
      ...(linkTarget ? { linkTarget } : {}),
      ...(invalidLink ? { linkBroken: true } : {}),
      ...(contentTruncated ? { contentTruncated: true } : {}),
    }
  }
  const writable = !linked && await fs.access(path, constants.W_OK).then(() => true, () => false)
  let encodingInvalid = false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch {
    encodingInvalid = true
  }
  const importsAgents = !encodingInvalid
    && content.toString('utf8').split(/\r?\n/).some((line) => line.trim() === '@AGENTS.md')
  const imports = encodingInvalid ? [] : await parseImports(content.toString('utf8'), dirname(path), rootForLink)
  const linksAgents = linked && realPath !== null && basename(realPath).toLowerCase() === 'agents.md'
  const bindings = bindingForDocument(path, scope, projectRoot).map((binding) => {
    if (
      scope === 'project'
      && basename(path) === 'CLAUDE.md'
      && binding.surface.vendorId === 'anthropic'
      && (importsAgents || linksAgents)
    ) {
      return { ...binding, status: 'bridged' as const }
    }
    return binding
  })
  return {
    id: path,
    kind: kindForName(basename(path)),
    fileName: basename(path),
    path,
    scope,
    ...(projectRoot ? { projectRoot, relativeDirectory: relative(projectRoot, dirname(path)) || '.' } : {}),
    bindings,
    contentHash: hash(content),
    modifiedAt: stat.mtimeMs,
    size: stat.size,
    readOnly: linked || !allowedLink || !writable || encodingInvalid,
    linked,
    ...(linkTarget ? { linkTarget } : {}),
    ...(encodingInvalid ? { encodingInvalid: true } : {}),
    ...(imports.length ? { imports } : {}),
  }
}

async function walk(root: string, names: Set<string>, rulesDirectories: string[], maxDepth: number): Promise<{ files: string[]; directories: string[] }> {
  const files: string[] = []
  const directories: string[] = []
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    directories.push(directory)
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        if (!INSTRUCTION_SCAN_EXCLUDES.has(entry.name.toLowerCase())) await visit(join(directory, entry.name), depth + 1)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const path = join(directory, entry.name)
        const inRulesDirectory = rulesDirectories.some((candidate) => matchesRulesDirectory(path, root, candidate))
        if (names.has(entry.name) || (inRulesDirectory && /\.(?:md|mdc)$/i.test(entry.name))) files.push(path)
      }
    }
  }
  await visit(root, 0)
  return { files, directories }
}

export async function scanInstructionDocuments(
  projectRoots: string[],
  options: { maxDepth?: number; includeGlobal?: boolean } = {},
): Promise<InstructionScanResult> {
  const documents = new Map<string, InstructionDocument>()
  const warnings: InstructionDiagnostic[] = []
  const names = candidateNames()
  const rulesDirectories = [...new Set(INSTRUCTION_PROFILES.flatMap((profile) => profile.rulesDirCandidates ?? []))]
  const requestedRoots = projectRoots.map((root) => resolve(root))
  const scannedRoots: string[] = []
  const directories: InstructionDirectory[] = []
  if (options.includeGlobal !== false) {
    for (const profile of INSTRUCTION_PROFILES) {
      for (const globalPath of profile.globalPaths) {
        const document = await readDocument(globalPath, 'user', undefined, resolve(homedir()))
        if (document) documents.set(document.path, document)
      }
    }
  }
  for (const root of requestedRoots) {
    const realRoot = await fs.realpath(root).catch(() => null)
    if (!realRoot) {
      warnings.push({ code: 'project-unavailable', severity: 'error', message: `项目目录不可访问：${root}`, paths: [root], fixable: false })
      continue
    }
    if (scannedRoots.includes(realRoot)) continue
    scannedRoots.push(realRoot)
    const walked = await walk(realRoot, names, rulesDirectories, options.maxDepth ?? MAX_DEPTH)
    directories.push(...walked.directories.map((path) => ({
      projectRoot: realRoot,
      path,
      relativeDirectory: relative(realRoot, path) || '.',
    })))
    for (const path of walked.files) {
      const document = await readDocument(path, 'project', realRoot, realRoot)
      if (document) documents.set(path, document)
    }
  }
  const scannedDocuments = [...documents.values()].sort((a, b) => a.path.localeCompare(b.path))
  applyFallbackShadowing(scannedDocuments)
  applyClaudeBridgeConflicts(scannedDocuments)
  return { documents: scannedDocuments, warnings, scannedRoots, directories }
}
