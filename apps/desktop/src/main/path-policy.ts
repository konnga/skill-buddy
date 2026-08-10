import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Skill, SkillRoot } from '@skillbuddy/core'
import type { CustomPlatformInput } from '../shared/ipc.js'

interface ManagedRoot {
  path: string
  readOnly: boolean
}

/** 判断目标路径是否位于指定目录内，且不把目录本身视为子项。 */
function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function realpath(path: string): Promise<string> {
  try {
    return await fs.realpath(path)
  } catch {
    throw new Error(`path does not exist or is not accessible: ${path}`)
  }
}

/**
 * 主进程文件访问白名单。扫描目录、用户明确选择的目录和应用创建的临时目录
 * 是唯一可读来源；删除只允许命中可管理 Skills 根目录的直接子目录。
 */
export class PathAccessPolicy {
  private managedRoots: ManagedRoot[] = []
  private selectedRoots = new Set<string>()
  private temporaryRoots = new Map<string, boolean>()

  setSkillRoots(roots: SkillRoot[]): void {
    this.managedRoots = roots.map((root) => ({
      path: resolve(root.path),
      readOnly: root.readOnly,
    }))
  }

  grantSelectedRoot(path: string): void {
    this.selectedRoots.add(resolve(path))
  }

  grantTemporaryRoot(path: string, rendererCleanup = false): void {
    this.temporaryRoots.set(resolve(path), rendererCleanup)
  }

  revokeTemporaryRoot(path: string): void {
    this.temporaryRoots.delete(resolve(path))
  }

  /** 确认文件或目录来自已授权根目录，并阻止符号链接逃逸。 */
  async assertReadable(path: string): Promise<void> {
    const target = await realpath(path)
    const roots = [
      ...this.managedRoots.map((root) => root.path),
      ...this.selectedRoots,
      ...this.temporaryRoots.keys(),
    ]
    for (const root of roots) {
      let canonicalRoot: string
      try {
        canonicalRoot = await fs.realpath(root)
      } catch {
        continue
      }
      if (target === canonicalRoot || isWithin(canonicalRoot, target)) return
    }
    throw new Error(`path is outside the allowed Skill directories: ${path}`)
  }

  /** 确认路径是某个可写 Skills 根目录下的一个完整 Skill 目录。 */
  async assertWritableSkillDirectory(path: string): Promise<void> {
    const target = await realpath(path)
    for (const root of this.managedRoots) {
      if (root.readOnly) continue
      let canonicalRoot: string
      try {
        canonicalRoot = await fs.realpath(root.path)
      } catch {
        continue
      }
      if (dirname(target) !== canonicalRoot || basename(target) === '') continue
      const hasSkillFile = await Promise.all([
        fs.access(resolve(target, 'SKILL.md')).then(() => true, () => false),
        fs.access(resolve(target, 'SKILL.md.disabled')).then(() => true, () => false),
      ])
      if (hasSkillFile.some(Boolean)) return
    }
    throw new Error(`path is not a managed Skill directory: ${path}`)
  }

  /** 确认安装目标是当前扫描结果中的可写平台根目录。 */
  assertWritableTargetRoot(path: string): void {
    const target = resolve(path)
    if (this.managedRoots.some((root) => !root.readOnly && root.path === target)) return
    throw new Error(`target is outside the managed platform directories: ${path}`)
  }

  /** 校验 Renderer 传回的资源源文件，防止借安装能力复制任意本机文件。 */
  async assertSkillResources(skill: Skill): Promise<void> {
    for (const source of Object.values(skill.resources ?? {})) {
      await this.assertReadable(source)
    }
  }

  /** 仅允许清理由应用创建并登记过的临时目录。 */
  assertTemporaryRoot(path: string): void {
    if (this.temporaryRoots.get(resolve(path)) !== true) {
      throw new Error(`temporary directory is not owned by SkillBuddy: ${path}`)
    }
  }
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path)
}

/** 校验自定义平台，避免通过目录配置扩大主进程文件访问范围。 */
export function validateCustomPlatform(input: CustomPlatformInput): CustomPlatformInput {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)) {
    throw new Error(`invalid platform id: ${input.id}`)
  }
  if (!input.displayName.trim()) throw new Error('platform display name is required')
  if (!input.detectPath.trim()) throw new Error('platform detect path is required')
  if (!input.userSkillsDir && !input.projectSkillsDir) {
    throw new Error('platform must define at least one Skills directory')
  }

  const home = resolve(homedir())
  const assertHomePath = (value: string | null, field: string): void => {
    if (value === null) return
    const expanded = expandHome(value)
    if (!isWithin(home, expanded)) {
      throw new Error(`${field} must be inside the user home directory`)
    }
  }
  assertHomePath(input.userSkillsDir, 'userSkillsDir')
  assertHomePath(input.detectPath, 'detectPath')
  if (input.userSkillsDir && basename(expandHome(input.userSkillsDir)).toLowerCase() !== 'skills') {
    throw new Error('userSkillsDir must point to a directory named skills')
  }

  if (input.projectSkillsDir) {
    if (isAbsolute(input.projectSkillsDir)) {
      throw new Error('projectSkillsDir must be relative to the project root')
    }
    const normalized = input.projectSkillsDir.replaceAll('\\', '/')
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new Error('projectSkillsDir cannot escape the project root')
    }
    if (basename(normalized).toLowerCase() !== 'skills') {
      throw new Error('projectSkillsDir must point to a directory named skills')
    }
  }
  return {
    ...input,
    displayName: input.displayName.trim(),
  }
}
