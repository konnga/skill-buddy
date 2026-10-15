import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { allAdapters, allPlatformDefs } from './adapters/index.js'
import { comparePlatformDisplayName } from './platforms.js'
import { detectPlatformResidue, filterSafeResidueCandidates, platformOwnedRoots } from './platform-residue.js'
import {
  DISABLED_SKILL_FILE_NAME,
  readSkillDirState,
  SKILL_FILE_NAME,
  type SkillParseWarning,
} from './skill-io.js'
import { listParkedLinks, SKILLBUDDY_DIR_NAME } from './skill-link.js'
import type { AgentId, InstalledSkill, SkillLinkKind, SkillRoot } from './types.js'

export interface PlatformStatus {
  id: AgentId
  displayName: string
  detected: boolean
  hasProjectScope: boolean
  /**
   * 「应用已删除、只剩残留目录」时可清理的目录（绝对路径，空数组表示无需提示）。
   *
   * 只有可信内置平台才可能非空，且仅在默认路径缺失、系统查询也未找到本体时才
   * 带出路径 —— 应用还在时那些目录正被使用，不能给删除入口。见 platform-residue.ts。
   */
  residualPaths: string[]
}

/** One directory whose immediate children are SKILL.md folders. */
export type { SkillRoot } from './types.js'

/** Backward-compatible exports; implementations live in dedicated adapters. */
export {
  discoverClaudePluginRoots,
  discoverCodexSupplementalRoots,
  discoverDoubaoSupplementalRoots,
  discoverLingxiSupplementalRoots,
  discoverOmpSupplementalRoots,
  discoverPiSupplementalRoots,
} from './adapters/index.js'

/** Detection status of every registered platform, for pickers and sidebars. */
export async function listPlatformStatus(
  homeDir: string = homedir(),
  os: NodeJS.Platform = process.platform,
): Promise<PlatformStatus[]> {
  const defs = allPlatformDefs()
  const defById = new Map(defs.map((def) => [def.id, def]))
  const adapters = allAdapters()
  const base = await Promise.all(
    adapters.map(async (adapter) => ({
      id: adapter.agent,
      displayName: adapter.displayName,
      detected: await adapter.detect(),
      hasProjectScope: adapter.skillsDir('project', '/probe') !== null,
    })),
  )
  const detectedIds = new Set(base.filter((status) => status.detected).map((status) => status.id))

  /** 适配器实际使用的用户目录也需要保护，包括 CODEX_HOME 和插件等补充目录。 */
  const effectiveRoots = new Map<AgentId, string[]>()
  let protectionComplete = true
  await Promise.all(adapters.filter((adapter) => detectedIds.has(adapter.agent)).map(async (adapter) => {
    try {
      const roots: string[] = []
      const userPath = adapter.skillsDir('user')
      if (userPath) roots.push(userPath)
      const supplemental = adapter.supplementalRoots
        ? await adapter.supplementalRoots([])
        : await adapter.supplementalSkillRoots?.()
      roots.push(...(supplemental ?? []).map((root) => root.path))
      effectiveRoots.set(adapter.agent, roots)
    } catch {
      protectionComplete = false
    }
  }))

  const protectedRoots = (ownerId: AgentId): string[] => [
    homeDir,
    ...defs
      .filter((def) => def.id !== ownerId)
      .flatMap((def) => [
        ...platformOwnedRoots(def, homeDir, os),
        ...(effectiveRoots.get(def.id) ?? []),
      ]),
  ]

  return Promise.all(
    base.map(async (status): Promise<PlatformStatus> => {
      const def = defById.get(status.id)
      const residue = def ? await detectPlatformResidue(def, homeDir, os) : null
      return {
        ...status,
        residualPaths:
          protectionComplete && residue?.installationState === 'missing'
            ? await filterSafeResidueCandidates(residue.paths, protectedRoots(status.id), homeDir)
            : [],
      }
    }),
  ).then((statuses) =>
    // 展示顺序按显示名排序，不跟着注册顺序走：侧边栏、设置页、安装目标三处都直接
    // 渲染这个数组，声明顺序排出来是「引入时间顺序」，新平台会永远落在表尾。
    statuses.sort((left, right) => comparePlatformDisplayName(left.displayName, right.displayName)),
  )
}

async function listDirectories(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true })
    const directories: string[] = []
    for (const entry of entries) {
      // SkillBuddy 的私有目录存放已禁用的链接，不是平台可见的 Skill。
      if (entry.name === SKILLBUDDY_DIR_NAME) continue
      if (entry.isDirectory()) {
        directories.push(entry.name)
        continue
      }
      if (!entry.isSymbolicLink()) continue
      try {
        if ((await fs.stat(join(path, entry.name))).isDirectory()) directories.push(entry.name)
      } catch {
        // Ignore broken links.
      }
    }
    return directories
  } catch {
    return []
  }
}

function dedupeRoots(roots: SkillRoot[]): SkillRoot[] {
  const seen = new Set<string>()
  return roots.filter((root) => {
    const key = `${root.agent}:${resolve(root.path)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Resolve every managed and supplemental skill root for detected platforms. */
export async function listSkillRoots(projectRoots: string[] = []): Promise<SkillRoot[]> {
  const roots: SkillRoot[] = []

  for (const adapter of allAdapters()) {
    if (!(await adapter.detect())) continue
    const canToggle = adapter.supportsToggle !== false && adapter.capabilities?.canToggle !== false
    const userPath = adapter.skillsDir('user')
    if (userPath) {
      roots.push({
        agent: adapter.agent,
        scope: 'user',
        path: userPath,
        origin: 'user',
        readOnly: false,
        canToggle,
      })
    }

    const supplementalRoots = await adapter.supplementalRoots?.(projectRoots)
    if (supplementalRoots) {
      roots.push(...supplementalRoots)
    } else {
      const legacyRoots = await adapter.supplementalSkillRoots?.()
      roots.push(
        ...(legacyRoots ?? []).map((root) => ({
          ...root,
          agent: adapter.agent,
          canToggle: false,
        })),
      )
    }

    for (const projectRoot of projectRoots) {
      const projectPath = adapter.skillsDir('project', projectRoot)
      if (!projectPath) continue
      roots.push({
        agent: adapter.agent,
        scope: 'project',
        path: projectPath,
        projectRoot,
        origin: 'project',
        readOnly: false,
        canToggle,
      })
    }
  }

  return dedupeRoots(roots)
}

interface LinkMeta {
  linked: boolean
  linkKind?: SkillLinkKind
  linkTarget?: string
}

/** 判定目录项是否为链接，并区分其归属；不跟随链接，避免误读上游。 */
async function readLinkMeta(skillPath: string, root: SkillRoot): Promise<LinkMeta> {
  const entry = await fs.lstat(skillPath).catch(() => null)
  if (!entry?.isSymbolicLink()) return { linked: false }
  return {
    linked: true,
    linkKind: root.runtimeProjection ? 'runtime' : 'reference',
    linkTarget: (await fs.readlink(skillPath).catch(() => null)) ?? undefined,
  }
}

/**
 * Read the links parked in this root's disabled area back as disabled installations.
 *
 * 停放区的启停语义由链接所在位置决定：链接指向的上游本体始终带着启用态的
 * SKILL.md，因此这里必须强制 `enabled: false`，绝不能取 `readSkillDirState`
 * 的判断，否则界面会显示成已启用，而平台其实根本扫不到它。
 */
async function scanParkedLinks(
  root: SkillRoot,
  warnings: SkillParseWarning[] = [],
): Promise<InstalledSkill[]> {
  const skills: InstalledSkill[] = []
  for (const parked of await listParkedLinks(root.path)) {
    const base = {
      agent: root.agent,
      scope: root.scope,
      path: parked.path,
      projectRoot: root.projectRoot,
      origin: root.origin,
      readOnly: root.readOnly,
      linked: true,
      linkKind: 'reference' as const,
      linkTarget: parked.target ?? undefined,
      enabled: false,
    }
    // 上游本体已消失时保留条目并标记，否则已禁用的 Skill 会静默从列表消失。
    if (parked.broken) {
      skills.push({
        ...base,
        linkBroken: true,
        canToggle: false,
        skill: { name: parked.name, description: '', content: '' },
      })
      continue
    }
    let state
    try {
      state = await readSkillDirState(parked.path, parked.name, (warning) => warnings.push(warning))
    } catch {
      // 单个损坏或暂时不可读的链接不能阻断同一根目录下的其他 Skill。
      continue
    }
    if (!state) continue
    const modifiedAt = await fs
      .stat(join(parked.path, SKILL_FILE_NAME))
      .then((entry) => entry.mtimeMs)
      .catch(() => undefined)
    skills.push({ ...base, canToggle: root.canToggle, modifiedAt, parseError: state.parseError, skill: state.skill })
  }
  return skills
}

export interface ScanInstalledSkillsResult {
  skills: InstalledSkill[]
  warnings: SkillParseWarning[]
}

async function scanSkillRoot(
  root: SkillRoot,
  warnings: SkillParseWarning[] = [],
): Promise<InstalledSkill[]> {
  const skills: InstalledSkill[] = []
  for (const name of await listDirectories(root.path)) {
    const skillPath = join(root.path, name)
    let state
    try {
      state = await readSkillDirState(skillPath, name, (warning) => warnings.push(warning))
    } catch {
      // Skill 文件可能来自第三方或外部同步目录；单个异常项应被隔离。
      continue
    }
    if (!state) continue
    const link = await readLinkMeta(skillPath, root)
    let modifiedAt: number | undefined
    try {
      modifiedAt = (
        await fs.stat(join(skillPath, state.enabled ? SKILL_FILE_NAME : DISABLED_SKILL_FILE_NAME))
      ).mtimeMs
    } catch {
      modifiedAt = undefined
    }
    skills.push({
      agent: root.agent,
      scope: root.scope,
      path: skillPath,
      projectRoot: root.projectRoot,
      origin: root.origin,
      readOnly: root.readOnly,
      ...link,
      // 运行态投影目录由平台自行全量重建，搬动其中的链接会被下次刷新冲掉。
      canToggle: link.linkKind === 'runtime' ? false : root.canToggle,
      enabled: state.enabled,
      modifiedAt,
      parseError: state.parseError,
      skill: state.skill,
    })
  }
  skills.push(...(await scanParkedLinks(root, warnings)))
  return skills
}

/** Scan every resolved root and return all locally available skills. */
export async function scanInstalledSkills(
  projectRoots: string[] = [],
  resolvedRoots?: readonly SkillRoot[],
): Promise<InstalledSkill[]> {
  return (await scanInstalledSkillsWithWarnings(projectRoots, resolvedRoots)).skills
}

/** Scan installed Skills while retaining non-blocking frontmatter diagnostics. */
export async function scanInstalledSkillsWithWarnings(
  projectRoots: string[] = [],
  resolvedRoots?: readonly SkillRoot[],
): Promise<ScanInstalledSkillsResult> {
  const roots = resolvedRoots ?? (await listSkillRoots(projectRoots))
  const warnings: SkillParseWarning[] = []
  const installations = (await Promise.all(roots.map((root) => scanSkillRoot(root, warnings)))).flat()
  const reconciled: InstalledSkill[] = []
  const registeredAgents = new Set<AgentId>()
  for (const adapter of allAdapters()) {
    registeredAgents.add(adapter.agent)
    const agentInstallations = installations.filter(
      (installation) => installation.agent === adapter.agent,
    )
    reconciled.push(
      ...(adapter.reconcileInstallations?.(agentInstallations) ?? agentInstallations),
    )
  }
  reconciled.push(
    ...installations.filter((installation) => !registeredAgents.has(installation.agent)),
  )
  return { skills: reconciled, warnings }
}
