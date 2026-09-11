import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { allAdapters } from './adapters/index.js'
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
export async function listPlatformStatus(): Promise<PlatformStatus[]> {
  return Promise.all(
    allAdapters().map(async (adapter) => ({
      id: adapter.agent,
      displayName: adapter.displayName,
      detected: await adapter.detect(),
      hasProjectScope: adapter.skillsDir('project', '/probe') !== null,
    })),
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
  const scanDirectory = async (skillPath: string, name: string): Promise<boolean> => {
    let state
    try {
      state = await readSkillDirState(skillPath, name, (warning) => warnings.push(warning))
    } catch {
      // Skill 文件可能来自第三方或外部同步目录；单个异常项应被隔离。
      return false
    }
    if (!state) return false
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
    return true
  }

  const scanHermesCategory = async (directory: string): Promise<void> => {
    for (const name of await listDirectories(directory)) {
      // Hermes 的 .hub 等隐藏目录是包管理元数据，不是 Skill 分类。
      if (name.startsWith('.')) continue
      const skillPath = join(directory, name)
      if (!(await scanDirectory(skillPath, name))) {
        await scanHermesCategory(skillPath)
      }
    }
  }

  for (const name of await listDirectories(root.path)) {
    if (name.startsWith('.')) continue
    const skillPath = join(root.path, name)
    if (!(await scanDirectory(skillPath, name)) && root.agent === 'hermes') {
      await scanHermesCategory(skillPath)
    }
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
