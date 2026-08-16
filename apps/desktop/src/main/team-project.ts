import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, parse as parsePath, resolve } from 'node:path'
import { parse, stringify } from 'yaml'
import type {
  TeamLibraryPolicy,
  TeamProjectConfig,
  TeamProjectConfigResult,
  TeamProjectRequirements,
} from '../shared/ipc.js'

const MAX_CONFIG_BYTES = 64 * 1024
const MAX_REQUIREMENTS = 256
const LIBRARY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function requirementList(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_REQUIREMENTS) {
    throw new Error(`${field} 必须是最多 ${MAX_REQUIREMENTS} 项的字符串数组`)
  }
  const results = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim() || /[\u0000-\u001f]/.test(item)) {
      throw new Error(`${field} 包含无效引用`)
    }
    results.add(item.trim())
  }
  return [...results]
}

function normalizePolicy(value: unknown): TeamLibraryPolicy | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('policy 必须是对象')
  }
  const policy = value as Record<string, unknown>
  if (!exactKeys(policy, ['required', 'recommended', 'blocked'])) {
    throw new Error('policy 包含不支持的字段')
  }
  const resourceGroup = (group: unknown, field: string) => {
    if (group === undefined) return { skills: [], mcp: [] }
    if (typeof group !== 'object' || group === null || Array.isArray(group)) {
      throw new Error(`${field} 必须是对象`)
    }
    const source = group as Record<string, unknown>
    if (!exactKeys(source, ['skills', 'mcp'])) throw new Error(`${field} 包含不支持的字段`)
    return {
      skills: requirementList(source.skills, `${field}.skills`),
      mcp: requirementList(source.mcp, `${field}.mcp`),
    }
  }
  const blocked = policy.blocked === undefined
    ? []
    : Array.isArray(policy.blocked)
      ? policy.blocked.map((entry, index) => {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error(`policy.blocked[${index}] 必须是对象`)
          }
          const item = entry as Record<string, unknown>
          if (!exactKeys(item, ['ref', 'versions', 'reason'])) {
            throw new Error(`policy.blocked[${index}] 包含不支持的字段`)
          }
          if (typeof item.ref !== 'string' || !item.ref.trim() || typeof item.reason !== 'string' || !item.reason.trim()) {
            throw new Error(`policy.blocked[${index}] 缺少 ref 或 reason`)
          }
          return {
            ref: item.ref.trim(),
            ...(typeof item.versions === 'string' && item.versions.trim()
              ? { versions: item.versions.trim() }
              : {}),
            reason: item.reason.trim(),
          }
        })
      : (() => { throw new Error('policy.blocked 必须是数组') })()
  return {
    required: resourceGroup(policy.required, 'policy.required'),
    recommended: resourceGroup(policy.recommended, 'policy.recommended'),
    blocked,
  }
}

export function normalizeTeamProjectConfig(value: unknown): TeamProjectConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('项目团队配置必须是 YAML 对象')
  }
  const root = value as Record<string, unknown>
  if (!exactKeys(root, ['version', 'library', 'teams', 'requires', 'policy'])) {
    throw new Error('项目团队配置包含不支持的顶层字段')
  }
  if (root.version !== 1) throw new Error('项目团队配置 version 必须为 1')
  if (typeof root.requires !== 'object' || root.requires === null || Array.isArray(root.requires)) {
    throw new Error('项目团队配置缺少 requires 对象')
  }
  const requires = root.requires as Record<string, unknown>
  if (!exactKeys(requires, ['bundles', 'skills', 'mcp'])) {
    throw new Error('requires 包含不支持的字段')
  }
  const library = typeof root.library === 'string' ? root.library.trim() : ''
  if (library && !LIBRARY_ID_RE.test(library)) throw new Error('library 必须是有效的团队库 ID')
  const teams = requirementList(root.teams, 'teams')
  if (teams.some((team) => {
    const parts = team.split(':')
    return parts.length > 2 || parts.some((part) => !LIBRARY_ID_RE.test(part))
  })) {
    throw new Error('teams 包含无效的团队 ID')
  }
  const normalizedRequires: TeamProjectRequirements = {
    bundles: requirementList(requires.bundles, 'requires.bundles'),
    skills: requirementList(requires.skills, 'requires.skills'),
    mcp: requirementList(requires.mcp, 'requires.mcp'),
  }
  return {
    version: 1,
    ...(library ? { library } : {}),
    teams,
    requires: normalizedRequires,
    ...(root.policy !== undefined ? { policy: normalizePolicy(root.policy) } : {}),
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}

/** 读取项目根目录中的 .skillbuddy/team.yaml，并返回经过白名单校验的结构。 */
export async function readTeamProjectConfig(input: unknown): Promise<TeamProjectConfigResult> {
  const candidate = typeof input === 'string' ? input.trim() : ''
  const projectRoot = candidate && isAbsolute(candidate) ? resolve(candidate) : candidate
  const configPath = projectRoot ? join(projectRoot, '.skillbuddy', 'team.yaml') : ''
  try {
    if (!candidate || !isAbsolute(candidate) || /[\u0000-\u001f]/.test(candidate)) {
      throw new Error('项目根目录必须是有效的绝对路径')
    }
    if (projectRoot === resolve(homedir()) || parsePath(projectRoot).root === projectRoot) {
      throw new Error('不能把用户主目录或文件系统根目录作为项目根目录')
    }
    if (!(await fs.stat(projectRoot)).isDirectory()) throw new Error('项目根目录不存在或不是目录')
    const teamDirectory = join(projectRoot, '.skillbuddy')
    let directoryStat
    try {
      directoryStat = await fs.lstat(teamDirectory)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { projectRoot, configPath, found: false }
      throw error
    }
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error('.skillbuddy 必须是项目内的真实目录')
    }
    let configStat
    try {
      configStat = await fs.lstat(configPath)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { projectRoot, configPath, found: false }
      throw error
    }
    if (configStat.isSymbolicLink() || !configStat.isFile()) throw new Error('team.yaml 必须是普通文件')
    if (configStat.size > MAX_CONFIG_BYTES) throw new Error('team.yaml 超过 64 KiB 限制')
    const config = normalizeTeamProjectConfig(parse(await fs.readFile(configPath, 'utf8')))
    return { projectRoot, configPath, found: true, config }
  } catch (error) {
    return {
      projectRoot,
      configPath,
      found: Boolean(configPath && errorCode(error) !== 'ENOENT'),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 原子写入项目团队配置，供配置向导使用。 */
export async function writeTeamProjectConfig(
  input: string,
  value: TeamProjectConfig,
): Promise<TeamProjectConfigResult> {
  const result = await readTeamProjectConfig(input)
  if (result.error) throw new Error(result.error)
  const config = normalizeTeamProjectConfig(value)
  const teamDirectory = join(result.projectRoot, '.skillbuddy')
  const stat = await fs.lstat(teamDirectory).catch(() => null)
  if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) {
    throw new Error('.skillbuddy 必须是项目内的真实目录')
  }
  await fs.mkdir(teamDirectory, { recursive: true })
  const path = join(teamDirectory, 'team.yaml')
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(temp, stringify(config), 'utf8')
  await fs.rename(temp, path)
  return { projectRoot: result.projectRoot, configPath: path, found: true, config }
}
