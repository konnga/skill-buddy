import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  aggregateSkills,
  readSkillDir,
  scanInstalledSkills,
  scanMcpServers,
  validateMcpDefinition,
  type McpServerDefinition,
  type Skill,
} from '@skillbuddy/core'
import type {
  InstallTarget,
  TeamLibraryCatalog,
  TeamLibraryBundleSummary,
  TeamLibraryConfig,
  TeamLibraryInstallRecord,
  TeamLibraryInitializeInput,
  TeamLibraryInitializeResult,
  TeamLibraryManifest,
  TeamLibraryMcp,
  TeamLibraryMcpInstallRecord,
  TeamLibraryPolicy,
  TeamLibraryProbeInput,
  TeamLibraryProbeResult,
  TeamLibrarySkill,
  TeamLibrarySourceInfo,
  TeamLibrarySyncResult,
} from '#shared/ipc'
import { normalizeTeamLibraryBranch, teamLibraryConfigKey } from '#shared/team-library'
import { blockedTeamAssetReason, emptyTeamPolicy, mergeTeamPolicies } from '#shared/team-policy'
import { readTeamProjectConfig } from './team-project'

const execFileAsync = promisify(execFile)
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_FILES = 5_000
const MAX_BYTES = 100 * 1024 * 1024
const SCRIPT_EXTENSIONS = new Set(['.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '', '.mjs', '.cjs', '.py', '.rb'])

interface CachedState {
  syncedAt: number
  revision: string
  remoteUrl: string
  branch: string
}

interface LoadedPolicySet {
  manifest: TeamLibraryManifest
  policy: TeamLibraryPolicy
  teamPolicies: Record<string, TeamLibraryPolicy>
}

interface ResolvedTeamLibraryConfig extends TeamLibraryConfig {
  id: string
  name: string
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith('/')
}

function libraryStorageKey(config: TeamLibraryConfig): string {
  return createHash('sha256').update(teamLibraryConfigKey(config)).digest('hex').slice(0, 32)
}

function libraryRoot(config: TeamLibraryConfig): string {
  return join(app.getPath('userData'), 'team-libraries', libraryStorageKey(config))
}

export function teamLibraryRepositoryRoot(input: TeamLibraryConfig): string {
  return join(libraryRoot(validateTeamLibraryConfig(input)), 'repository')
}

function statePath(config: TeamLibraryConfig): string {
  return join(libraryRoot(config), 'state.json')
}

function recordsPath(): string {
  return join(app.getPath('userData'), 'team-libraries', 'installations.json')
}

export function validateTeamLibraryConfig(input: TeamLibraryConfig): TeamLibraryConfig {
  const remoteUrl = input.remoteUrl.trim()
  const branch = normalizeTeamLibraryBranch(input.branch)
  if (!remoteUrl || remoteUrl.startsWith('-') || remoteUrl.includes('\0')) {
    throw new Error('Git 仓库地址无效')
  }
  if (/^(?:https?|git):\/\//.test(remoteUrl)) {
    const url = new URL(remoteUrl)
    if (url.username || url.password) throw new Error('Git 仓库地址不能包含凭据')
    if (url.protocol === 'git:') throw new Error('团队库不接受未加密的 git:// 地址')
  } else if (!/^(?:git@|ssh:\/\/)[\w.@:/~-]+$/.test(remoteUrl)) {
    throw new Error('团队库仅支持 HTTPS 或 SSH Git 地址')
  }
  if (
    branch.startsWith('-') ||
    branch.startsWith('.') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    /[\s~^:?*[\\]/.test(branch)
  ) {
    throw new Error('Git 分支名称无效')
  }
  return { remoteUrl, branch }
}

async function git(
  cwd: string | undefined,
  args: string[],
  timeout = 60_000,
  context = 'Git 同步',
): Promise<string> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return result.stdout.trim()
  } catch (error) {
    const stderr = typeof (error as { stderr?: unknown })?.stderr === 'string'
      ? (error as { stderr: string }).stderr
      : ''
    const message = (stderr || (error instanceof Error ? error.message : String(error)))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) ?? '未知错误'
    const authenticationHint = /authentication failed|could not read (?:username|password)|permission denied \(publickey\)|repository not found|terminal prompts disabled/i.test(message)
      ? '。私有仓库请先通过系统 Git Credential Manager、macOS 钥匙串或 SSH Agent 完成认证'
      : ''
    throw new Error(`${context}失败：${message}${authenticationHint}`)
  }
}

interface RemoteRefs {
  branches: string[]
  defaultBranch?: string
}

async function listRemoteRefs(remoteUrl: string): Promise<RemoteRefs> {
  const output = await git(
    undefined,
    ['ls-remote', '--symref', remoteUrl],
    30_000,
    'Git 仓库检测',
  )
  const branches = new Set<string>()
  let defaultBranch: string | undefined
  for (const line of output.split('\n')) {
    const defaultMatch = line.match(/^ref:\s+refs\/heads\/(.+)\s+HEAD$/)
    if (defaultMatch?.[1]) defaultBranch = defaultMatch[1]
    const branchMatch = line.match(/^[0-9a-f]+\s+refs\/heads\/(.+)$/i)
    if (branchMatch?.[1]) branches.add(branchMatch[1])
  }
  return {
    branches: [...branches].sort((left, right) => left.localeCompare(right)),
    ...(defaultBranch ? { defaultBranch } : {}),
  }
}

async function inspectTree(root: string): Promise<void> {
  let files = 0
  let bytes = 0
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const path = join(directory, entry.name)
      const stat = await fs.lstat(path)
      if (stat.isSymbolicLink()) throw new Error('团队库不能包含符号链接')
      if (stat.isDirectory()) await walk(path)
      else if (stat.isFile()) {
        files += 1
        bytes += stat.size
        if (files > MAX_FILES || bytes > MAX_BYTES) throw new Error('团队库内容超过安全限制')
      }
    }
  }
  await walk(root)
}

async function cloneTo(
  config: TeamLibraryConfig,
  destination: string,
  context = 'Git 同步',
): Promise<string> {
  await git(undefined, ['--version'], 5_000, context)
  await git(undefined, [
    'clone',
    '--depth',
    '1',
    '--branch',
    config.branch,
    '--single-branch',
    '--no-tags',
    config.remoteUrl,
    destination,
  ], 60_000, context)
  await inspectTree(destination)
  return git(destination, ['rev-parse', 'HEAD'], 60_000, context)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path, 'utf8')) as unknown
}

async function readStructured(path: string): Promise<unknown> {
  const content = await fs.readFile(path, 'utf8')
  return /\.ya?ml$/i.test(path) ? parseYaml(content) : JSON.parse(content) as unknown
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim()))]
    : []
}

function normalizePolicy(value: unknown): TeamLibraryPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyTeamPolicy()
  const policy = value as Record<string, unknown>
  const required = typeof policy.required === 'object' && policy.required !== null
    ? policy.required as Record<string, unknown>
    : {}
  const recommended = typeof policy.recommended === 'object' && policy.recommended !== null
    ? policy.recommended as Record<string, unknown>
    : {}
  const blocked = Array.isArray(policy.blocked)
    ? policy.blocked.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return []
        const item = entry as Record<string, unknown>
        if (typeof item.ref !== 'string' || typeof item.reason !== 'string') return []
        return [{
          ref: item.ref,
          ...(typeof item.versions === 'string' ? { versions: item.versions } : {}),
          reason: item.reason,
        }]
      })
    : []
  return {
    required: { skills: stringList(required.skills), mcp: stringList(required.mcp) },
    recommended: { skills: stringList(recommended.skills), mcp: stringList(recommended.mcp) },
    blocked,
  }
}

async function loadPolicyFile(root: string, path: string): Promise<TeamLibraryPolicy> {
  const absolute = resolve(root, path)
  if (!isWithin(root, absolute)) return emptyTeamPolicy()
  return normalizePolicy(await readStructured(absolute).catch(() => null))
}

async function loadPolicySet(root: string): Promise<LoadedPolicySet> {
  const value = await readStructured(join(root, 'team-library.yaml')).catch(() => {
    throw new Error('团队库缺少 team-library.yaml 清单')
  })
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('team-library.yaml 必须是对象')
  }
  const source = value as Record<string, unknown>
  if (source.version !== 1) {
    throw new Error('team-library.yaml 版本必须为 1')
  }
  const libraryId = typeof source.id === 'string' ? source.id.trim() : ''
  const libraryName = typeof source.name === 'string' ? source.name.trim() : ''
  if (!ID_RE.test(libraryId)) throw new Error('team-library.yaml 的 id 必须使用 kebab-case')
  if (!libraryName) throw new Error('team-library.yaml 的 name 不能为空')
  const policies = typeof source.policies === 'object' && source.policies !== null && !Array.isArray(source.policies)
    ? source.policies as Record<string, unknown>
    : {}
  const organizationPath = typeof policies.organization === 'string' && policies.organization.trim()
    ? policies.organization.trim()
    : null
  const teamsSource = typeof policies.teams === 'object' && policies.teams !== null && !Array.isArray(policies.teams)
    ? policies.teams as Record<string, unknown>
    : {}
  const teams: TeamLibraryManifest['teams'] = []
  const teamPolicies: Record<string, TeamLibraryPolicy> = {}
  for (const [id, raw] of Object.entries(teamsSource)) {
    if (!ID_RE.test(id)) continue
    const entry = typeof raw === 'string'
      ? { file: raw, name: id }
      : typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : null
    if (!entry || typeof entry.file !== 'string' || !entry.file.trim()) continue
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : id
    teams.push({ id, name })
    teamPolicies[id] = await loadPolicyFile(root, entry.file.trim())
  }
  return {
    manifest: {
      version: 1,
      id: libraryId,
      name: libraryName,
      teams,
    },
    policy: organizationPath ? await loadPolicyFile(root, organizationPath) : emptyTeamPolicy(),
    teamPolicies,
  }
}

function resolveTeamLibrary(
  config: TeamLibraryConfig,
  manifest: TeamLibraryManifest,
): ResolvedTeamLibraryConfig {
  return { ...config, id: manifest.id, name: manifest.name }
}

export async function readTeamLibraryManifest(root: string): Promise<TeamLibraryManifest> {
  return (await loadPolicySet(root)).manifest
}

/** 检测远程仓库状态，并在已有分支上校验团队库清单。 */
export async function probeTeamLibrary(
  input: TeamLibraryProbeInput,
): Promise<TeamLibraryProbeResult> {
  const requestedBranch = input.branch?.trim() ?? ''
  const validated = validateTeamLibraryConfig({
    remoteUrl: input.remoteUrl,
    branch: requestedBranch || 'main',
  })
  const refs = await listRemoteRefs(validated.remoteUrl)
  if (refs.branches.length === 0) {
    return {
      status: 'empty',
      remoteUrl: validated.remoteUrl,
      branch: requestedBranch || 'main',
      branches: [],
    }
  }
  const branch = requestedBranch || refs.defaultBranch || refs.branches[0]!
  if (!refs.branches.includes(branch)) {
    return {
      status: 'branch-missing',
      remoteUrl: validated.remoteUrl,
      branch,
      ...(refs.defaultBranch ? { defaultBranch: refs.defaultBranch } : {}),
      branches: refs.branches,
    }
  }
  const parent = await fs.mkdtemp(join(app.getPath('temp'), 'skillbuddy-team-library-probe-'))
  const repository = join(parent, 'repository')
  try {
    await cloneTo({ remoteUrl: validated.remoteUrl, branch }, repository, 'Git 仓库检测')
    try {
      const manifest = await readTeamLibraryManifest(repository)
      return {
        status: 'ready',
        remoteUrl: validated.remoteUrl,
        branch,
        ...(refs.defaultBranch ? { defaultBranch: refs.defaultBranch } : {}),
        branches: refs.branches,
        manifest,
      }
    } catch (error) {
      return {
        status: 'invalid',
        remoteUrl: validated.remoteUrl,
        branch,
        ...(refs.defaultBranch ? { defaultBranch: refs.defaultBranch } : {}),
        branches: refs.branches,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  } finally {
    await fs.rm(parent, { recursive: true, force: true })
  }
}

/** 在空远程仓库中创建标准团队库结构并推送首次提交。 */
export async function initializeTeamLibrary(
  input: TeamLibraryInitializeInput,
): Promise<TeamLibraryInitializeResult> {
  const config = validateTeamLibraryConfig(input)
  const id = input.id.trim()
  const name = input.name.trim()
  if (!ID_RE.test(id)) throw new Error('团队库 ID 必须使用 kebab-case')
  if (!name) throw new Error('团队库名称不能为空')
  const refs = await listRemoteRefs(config.remoteUrl)
  if (refs.branches.length > 0) {
    throw new Error('远程仓库已经包含分支，不能执行空仓库初始化')
  }
  const root = await fs.mkdtemp(join(app.getPath('temp'), 'skillbuddy-team-library-init-'))
  try {
    await git(undefined, ['init', '--initial-branch', config.branch, root], 30_000, '团队库初始化')
    await git(root, ['remote', 'add', 'origin', config.remoteUrl], 30_000, '团队库初始化')
    const manifest = {
      version: 1 as const,
      id,
      name,
      teams: [],
    }
    await fs.mkdir(join(root, 'policies'), { recursive: true })
    await Promise.all(['skills', 'mcp', 'bundles'].map(async (directory) => {
      const path = join(root, directory)
      await fs.mkdir(path, { recursive: true })
      await fs.writeFile(join(path, '.gitkeep'), '', 'utf8')
    }))
    await fs.writeFile(
      join(root, 'team-library.yaml'),
      stringifyYaml({
        version: manifest.version,
        id: manifest.id,
        name: manifest.name,
        policies: { organization: 'policies/organization.yaml' },
      }),
      'utf8',
    )
    await fs.writeFile(
      join(root, 'policies', 'organization.yaml'),
      stringifyYaml({
        required: { skills: [], mcp: [] },
        recommended: { skills: [], mcp: [] },
        blocked: [],
      }),
      'utf8',
    )
    await fs.writeFile(
      join(root, 'README.md'),
      `# ${name}\n\n此仓库由 SkillBuddy 初始化，用于管理团队 Skills、MCP、岗位包和策略。\n`,
      'utf8',
    )
    const userName = await git(root, ['config', 'user.name'], 5_000, '团队库初始化').catch(() => '')
    const userEmail = await git(root, ['config', 'user.email'], 5_000, '团队库初始化').catch(() => '')
    if (!userName) await git(root, ['config', 'user.name', 'SkillBuddy'], 5_000, '团队库初始化')
    if (!userEmail) {
      await git(root, ['config', 'user.email', 'skillbuddy@localhost'], 5_000, '团队库初始化')
    }
    await git(root, ['add', '--all'], 30_000, '团队库初始化')
    await git(root, ['commit', '-m', 'chore: 初始化团队库'], 30_000, '团队库初始化')
    await git(
      root,
      ['push', '--set-upstream', 'origin', config.branch],
      120_000,
      '团队库初始化',
    )
    return { config, manifest }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

function selectedTeamId(teamRef: string, defaultLibrary?: string): { libraryId?: string; teamId: string } {
  const separator = teamRef.indexOf(':')
  return separator > 0
    ? { libraryId: teamRef.slice(0, separator), teamId: teamRef.slice(separator + 1) }
    : { libraryId: defaultLibrary, teamId: teamRef }
}

function policyBlockedReason(
  policy: TeamLibraryPolicy,
  config: ResolvedTeamLibraryConfig,
  path: string,
  version?: string,
): string | null {
  return blockedTeamAssetReason(policy, path, version) ??
    blockedTeamAssetReason(policy, `${config.id}:${path}`, version)
}

async function projectBlockedReason(
  root: string,
  config: ResolvedTeamLibraryConfig,
  path: string,
  version: string | undefined,
  projectRoots: string[],
): Promise<string | null> {
  const policySet = await loadPolicySet(root)
  const organizationReason = policyBlockedReason(policySet.policy, config, path, version)
  if (organizationReason) return organizationReason
  for (const projectRoot of [...new Set(projectRoots)]) {
    const result = await readTeamProjectConfig(projectRoot)
    if (!result.config) continue
    const policies = [policySet.policy]
    for (const teamRef of result.config.teams) {
      const selected = selectedTeamId(teamRef, result.config.library)
      if (selected.libraryId && selected.libraryId !== config.id) continue
      const policy = policySet.teamPolicies[selected.teamId]
      if (policy) policies.push(policy)
    }
    if (result.config.policy) policies.push(result.config.policy)
    const reason = policyBlockedReason(mergeTeamPolicies(...policies), config, path, version)
    if (reason) return reason
  }
  return null
}

function sourceInfo(config: ResolvedTeamLibraryConfig, revision: string, path = ''): TeamLibrarySourceInfo {
  return {
    libraryId: config.id,
    libraryName: config.name,
    remoteUrl: config.remoteUrl,
    branch: config.branch,
    revision,
    path,
  }
}

function hasScript(paths: string[]): boolean {
  return paths.some((path) => SCRIPT_EXTENSIONS.has(path.slice(path.lastIndexOf('.')).toLowerCase()))
}

async function loadSkill(root: string, config: ResolvedTeamLibraryConfig, revision: string, path: string): Promise<TeamLibrarySkill> {
  const absolute = resolve(root, path)
  if (!isWithin(root, absolute)) throw new Error('Skill 路径越界')
  const skill = await readSkillDir(absolute, basename(absolute))
  if (!skill || !ID_RE.test(skill.name)) throw new Error(`无效的 Skill：${path}`)
  const resourcePaths = Object.keys(skill.resources ?? {})
  return {
    ...sourceInfo(config, revision, path),
    type: 'skill',
    name: skill.name,
    description: skill.description,
    version: skill.version,
    tags: skill.tags ?? [],
    hasScripts: hasScript(resourcePaths),
    contentHash: await hashSkill(skill),
    content: skill.content,
    resourcePaths,
  }
}

async function listSkills(root: string, config: ResolvedTeamLibraryConfig, revision: string): Promise<TeamLibrarySkill[]> {
  const skillsRoot = join(root, 'skills')
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
  const results: TeamLibrarySkill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = `skills/${entry.name}`
    const skill = await loadSkill(root, config, revision, path).catch(() => null)
    if (skill) results.push(skill)
  }
  return results.sort((left, right) => left.name.localeCompare(right.name))
}

async function listMcp(root: string, config: ResolvedTeamLibraryConfig, revision: string): Promise<TeamLibraryMcp[]> {
  const mcpRoot = join(root, 'mcp')
  const entries = await fs.readdir(mcpRoot, { withFileTypes: true }).catch(() => [])
  const results: TeamLibraryMcp[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = `mcp/${entry.name}`
    try {
      const value = await readJson(join(mcpRoot, entry.name))
      const wrapper = value as Record<string, unknown>
      const definition = (wrapper.definition ?? value) as McpServerDefinition
      validateMcpDefinition(definition, { source: 'user-input' })
      results.push({
        ...sourceInfo(config, revision, path),
        type: 'mcp',
        name: definition.name,
        description: typeof wrapper.description === 'string'
          ? wrapper.description
          : definition.description ?? '',
        version: typeof wrapper.version === 'string' ? wrapper.version : undefined,
        transport: definition.transport.kind,
        requiredSecrets: definition.requiredSecrets,
        definitionHash: createHash('sha256').update(JSON.stringify(definition)).digest('hex'),
        definition,
      })
    } catch {
      // 单个无效 MCP 不影响其他资源进入目录。
    }
  }
  return results.sort((left, right) => left.name.localeCompare(right.name))
}

async function listBundles(
  root: string,
  config: ResolvedTeamLibraryConfig,
  revision: string,
  skills: TeamLibrarySkill[],
  mcpServers: TeamLibraryMcp[],
): Promise<TeamLibraryBundleSummary[]> {
  const bundlesRoot = join(root, 'bundles')
  const entries = await fs.readdir(bundlesRoot, { withFileTypes: true }).catch(() => [])
  const skillPaths = new Set(skills.map((item) => item.path))
  const mcpPaths = new Set(mcpServers.map((item) => item.path))
  const seenIds = new Set<string>()
  const results: TeamLibraryBundleSummary[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = `bundles/${entry.name}`
    try {
      const value = await readJson(join(bundlesRoot, entry.name))
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
      const item = value as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const description = typeof item.description === 'string' ? item.description.trim() : ''
      const bundleSkills = stringList(item.skills)
      const bundleMcp = stringList(item.mcp)
      if (!ID_RE.test(id) || !name || seenIds.has(id) || bundleSkills.length + bundleMcp.length === 0) {
        continue
      }
      seenIds.add(id)
      results.push({
        ...sourceInfo(config, revision, path),
        type: 'bundle',
        id,
        name,
        description,
        ...(typeof item.version === 'string' && item.version.trim()
          ? { version: item.version.trim() }
          : {}),
        skills: bundleSkills,
        mcpServers: bundleMcp,
        missingSkills: bundleSkills.filter((ref) => !skillPaths.has(ref)),
        missingMcpServers: bundleMcp.filter((ref) => !mcpPaths.has(ref)),
      })
    } catch {
      // 单个无效 Bundle 不影响其他岗位环境包进入目录。
    }
  }
  return results.sort((left, right) => left.name.localeCompare(right.name))
}

async function readState(config: TeamLibraryConfig): Promise<CachedState> {
  const raw = await readJson(statePath(config))
  const value = typeof raw === 'object' && raw !== null ? raw as Partial<CachedState> : {}
  if (
    typeof value.revision !== 'string' ||
    typeof value.syncedAt !== 'number' ||
    value.remoteUrl !== config.remoteUrl ||
    value.branch !== config.branch
  ) {
    throw new Error('团队库缓存状态无效')
  }
  return {
    syncedAt: value.syncedAt,
    revision: value.revision,
    remoteUrl: value.remoteUrl,
    branch: value.branch,
  }
}

/** 从指定仓库工作区生成团队库目录，供同步缓存和贡献草稿复用。 */
export async function catalogFromTeamLibraryRoot(
  root: string,
  config: TeamLibraryConfig,
  revision: string,
  syncedAt = Date.now(),
): Promise<TeamLibraryCatalog> {
  const policySet = await loadPolicySet(root)
  const resolved = resolveTeamLibrary(config, policySet.manifest)
  const [skills, mcpServers] = await Promise.all([
    listSkills(root, resolved, revision),
    listMcp(root, resolved, revision),
  ])
  const bundles = await listBundles(root, resolved, revision, skills, mcpServers)
  return {
    source: sourceInfo(resolved, revision),
    syncedAt,
    skills: skills.map(({ content: _content, resourcePaths: _resources, ...skill }) => skill),
    mcpServers: mcpServers.map(({ definition: _definition, ...server }) => server),
    bundles,
    manifest: policySet.manifest,
    policy: policySet.policy,
    teamPolicies: policySet.teamPolicies,
  }
}

async function catalogFromCache(config: TeamLibraryConfig): Promise<TeamLibraryCatalog> {
  const state = await readState(config)
  return catalogFromTeamLibraryRoot(
    teamLibraryRepositoryRoot(config),
    config,
    state.revision,
    state.syncedAt,
  )
}

/** 同步 Git 团队库；失败时返回上一次成功缓存。 */
export async function syncTeamLibrary(input: TeamLibraryConfig): Promise<TeamLibrarySyncResult> {
  const config = validateTeamLibraryConfig(input)
  const root = libraryRoot(config)
  const staging = join(root, `repository-next-${Date.now()}`)
  await fs.mkdir(root, { recursive: true })
  try {
    const revision = await cloneTo(config, staging)
    await loadPolicySet(staging)
    const current = teamLibraryRepositoryRoot(config)
    const previous = join(root, `repository-previous-${Date.now()}`)
    const hasCurrent = await fs.access(current).then(() => true, () => false)
    if (hasCurrent) await fs.rename(current, previous)
    try {
      await fs.rename(staging, current)
    } catch (error) {
      if (hasCurrent) await fs.rename(previous, current)
      throw error
    }
    await fs.rm(previous, { recursive: true, force: true })
    await fs.writeFile(
      statePath(config),
      JSON.stringify({ syncedAt: Date.now(), revision, remoteUrl: config.remoteUrl, branch: config.branch }),
      'utf8',
    )
    return { catalog: await catalogFromCache(config), fromCache: false }
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true })
    try {
      return {
        catalog: await catalogFromCache(config),
        fromCache: true,
        warning: error instanceof Error ? error.message : String(error),
      }
    } catch {
      throw error
    }
  }
}

export async function getTeamLibrarySkill(input: TeamLibraryConfig, path: string): Promise<TeamLibrarySkill> {
  const config = validateTeamLibraryConfig(input)
  const state = await readState(config)
  const root = teamLibraryRepositoryRoot(config)
  const resolved = resolveTeamLibrary(config, await readTeamLibraryManifest(root))
  return loadSkill(root, resolved, state.revision, path)
}

export async function getTeamLibraryMcp(input: TeamLibraryConfig, path: string): Promise<TeamLibraryMcp> {
  const config = validateTeamLibraryConfig(input)
  const state = await readState(config)
  const root = teamLibraryRepositoryRoot(config)
  const resolved = resolveTeamLibrary(config, await readTeamLibraryManifest(root))
  const item = (await listMcp(root, resolved, state.revision)).find((server) => server.path === path)
  if (!item) throw new Error(`MCP Server 不存在：${path}`)
  return item
}

export async function materializeTeamSkill(
  input: TeamLibraryConfig,
  path: string,
  targets: InstallTarget[] = [],
): Promise<{ skill: Skill; source: TeamLibrarySkill }> {
  const config = validateTeamLibraryConfig(input)
  const state = await readState(config)
  const root = teamLibraryRepositoryRoot(config)
  const resolved = resolveTeamLibrary(config, await readTeamLibraryManifest(root))
  const source = await loadSkill(root, resolved, state.revision, path)
  const blockedReason = await projectBlockedReason(
    root,
    resolved,
    path,
    source.version,
    targets.flatMap((target) => target.scope === 'project' && target.projectRoot ? [target.projectRoot] : []),
  )
  if (blockedReason) throw new Error(`该 Skill 已被团队策略禁用：${blockedReason}`)
  const skill = await readSkillDir(resolve(root, path), source.name)
  if (!skill) throw new Error(`Skill 不存在：${path}`)
  return { skill, source }
}

/** 安装 MCP 前在主进程重新执行团队禁用策略。 */
export async function assertTeamLibraryMcpInstallAllowed(
  input: TeamLibraryConfig,
  path: string,
  targets: import('@skillbuddy/core').McpTarget[] = [],
): Promise<void> {
  const config = validateTeamLibraryConfig(input)
  const root = teamLibraryRepositoryRoot(config)
  const source = await getTeamLibraryMcp(config, path)
  const resolved = resolveTeamLibrary(config, await readTeamLibraryManifest(root))
  const blockedReason = await projectBlockedReason(
    root,
    resolved,
    path,
    source.version,
    targets.flatMap((target) => target.projectRoot ? [target.projectRoot] : []),
  )
  if (blockedReason) throw new Error(`该 MCP Server 已被团队策略禁用：${blockedReason}`)
}

async function hashSkill(skill: Skill): Promise<string> {
  const hash = createHash('sha256')
  hash.update(JSON.stringify({
    description: skill.description,
    version: skill.version ?? '',
    tags: [...(skill.tags ?? [])].sort(),
    content: skill.content,
  }))
  for (const [path, source] of Object.entries(skill.resources ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(path)
    hash.update(await fs.readFile(source))
  }
  return hash.digest('hex')
}

export async function recordTeamSkillInstall(
  source: TeamLibrarySkill,
  skill: Skill,
  targets: InstallTarget[],
): Promise<void> {
  const path = recordsPath()
  await fs.mkdir(dirname(path), { recursive: true })
  const existing = await readJson(path).catch(() => [])
  const records = Array.isArray(existing) ? existing as TeamLibraryInstallRecord[] : []
  const contentHash = source.contentHash
  const added = targets.map((target): TeamLibraryInstallRecord => ({
    libraryId: source.libraryId,
    libraryName: source.libraryName,
    remoteUrl: source.remoteUrl,
    branch: source.branch,
    revision: source.revision,
    path: source.path,
    type: 'skill',
    name: source.name,
    version: source.version,
    contentHash,
    target,
    installedAt: Date.now(),
  }))
  const targetKey = (record: TeamLibraryInstallRecord): string =>
    `${record.libraryId}:${record.path}:${record.target.agent}:${record.target.scope}:${record.target.projectRoot ?? ''}`
  const replaced = new Set(added.map(targetKey))
  await fs.writeFile(path, JSON.stringify([...records.filter((record) => !replaced.has(targetKey(record))), ...added], null, 2), 'utf8')
}

export async function recordTeamMcpInstall(
  source: TeamLibraryMcp,
  targets: import('@skillbuddy/core').McpTarget[],
): Promise<void> {
  const path = recordsPath()
  await fs.mkdir(dirname(path), { recursive: true })
  const existing = await readJson(path).catch(() => [])
  const records = Array.isArray(existing) ? existing as TeamLibraryInstallRecord[] : []
  const definitionHash = source.definitionHash
  const added = targets.map((target): TeamLibraryMcpInstallRecord => ({
    libraryId: source.libraryId,
    libraryName: source.libraryName,
    remoteUrl: source.remoteUrl,
    branch: source.branch,
    revision: source.revision,
    path: source.path,
    type: 'mcp',
    name: source.name,
    version: source.version,
    definitionHash,
    target,
    installedAt: Date.now(),
  }))
  const targetKey = (record: TeamLibraryInstallRecord): string => {
    if (record.type === 'skill') {
      return `${record.type}:${record.libraryId}:${record.path}:${record.target.agent}:${record.target.scope}:${record.target.projectRoot ?? ''}`
    }
    return `${record.type}:${record.libraryId}:${record.path}:${record.target.agent}:${record.target.surface}:${record.target.scope}:${record.target.projectRoot ?? ''}`
  }
  const replaced = new Set(added.map(targetKey))
  await fs.writeFile(
    path,
    JSON.stringify([...records.filter((record) => !replaced.has(targetKey(record))), ...added], null, 2),
    'utf8',
  )
}

export async function listTeamSkillInstallations(): Promise<TeamLibraryInstallRecord[]> {
  const value = await readJson(recordsPath()).catch(() => [])
  const records = Array.isArray(value) ? value as TeamLibraryInstallRecord[] : []
  const projectRoots = [...new Set(records.flatMap((record) =>
    record.target.projectRoot ? [record.target.projectRoot] : [],
  ))]
  const [skills, mcp] = await Promise.all([
    scanInstalledSkills(projectRoots).then(aggregateSkills),
    scanMcpServers(projectRoots),
  ])
  const normalized = (path: string | undefined) =>
    (path ?? '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
  return records.map((record): TeamLibraryInstallRecord => {
    if (record.type === 'skill') {
      const installation = skills.flatMap((item) => item.installations).find((item) =>
        item.skill.name === record.name &&
        item.agent === record.target.agent &&
        item.scope === record.target.scope &&
        normalized(item.projectRoot) === normalized(record.target.projectRoot),
      )
      if (!installation) return { ...record, status: 'missing' }
      return {
        ...record,
        status: installation.contentHash === record.contentHash ? 'current' : 'outdated',
        actualHash: installation.contentHash,
      }
    }
    const installation = mcp.installations.find((item) =>
      item.definition.name === record.name &&
      item.source.agent === record.target.agent &&
      item.source.surface === record.target.surface &&
      item.source.scope === record.target.scope &&
      normalized(item.source.projectRoot) === normalized(record.target.projectRoot),
    )
    if (!installation) return { ...record, status: 'missing' }
    return {
      ...record,
      status: installation.definitionHash === record.definitionHash ? 'current' : 'outdated',
      actualHash: installation.definitionHash,
    }
  })
}
