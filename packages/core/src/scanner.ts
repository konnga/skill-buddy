import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { allAdapters } from './adapters/index.js'
import { exists } from './adapters/shared.js'
import { readSkillDir } from './skill-io.js'
import type {
  AgentId,
  InstallScope,
  InstalledSkill,
  SkillOrigin,
} from './types.js'

export interface PlatformStatus {
  id: AgentId
  displayName: string
  detected: boolean
  hasProjectScope: boolean
}

/** One directory whose immediate children are SKILL.md folders. */
export interface SkillRoot {
  agent: AgentId
  scope: InstallScope
  path: string
  projectRoot?: string
  origin: SkillOrigin
  readOnly: boolean
}

interface ClaudePluginRecord {
  scope?: string
  installPath?: string
  projectPath?: string
}

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
  let entries
  try {
    entries = await fs.readdir(path, { withFileTypes: true })
  } catch {
    return []
  }

  const directories: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push(entry.name)
      continue
    }
    if (!entry.isSymbolicLink()) continue
    try {
      if ((await fs.stat(join(path, entry.name))).isDirectory()) directories.push(entry.name)
    } catch {
      // Ignore broken symlinks.
    }
  }
  return directories
}

/** Supplemental Codex roots outside the cross-tool .agents convention. */
export async function discoverCodexSupplementalRoots(
  homeDir: string = homedir(),
  codexHome: string = process.env.CODEX_HOME || join(homeDir, '.codex'),
): Promise<SkillRoot[]> {
  const roots: SkillRoot[] = [
    {
      agent: 'codex',
      scope: 'user',
      path: join(codexHome, 'skills'),
      origin: 'legacy',
      readOnly: true,
    },
    {
      agent: 'codex',
      scope: 'user',
      path: join(codexHome, 'skills', '.system'),
      origin: 'system',
      readOnly: true,
    },
    {
      agent: 'codex',
      scope: 'user',
      path: '/etc/codex/skills',
      origin: 'admin',
      readOnly: true,
    },
  ]

  const cacheRoot = join(codexHome, 'plugins', 'cache')
  for (const marketplace of await listDirectories(cacheRoot)) {
    const marketplacePath = join(cacheRoot, marketplace)
    for (const plugin of await listDirectories(marketplacePath)) {
      const pluginPath = join(marketplacePath, plugin)
      const candidates = await Promise.all(
        (await listDirectories(pluginPath)).map(async (version) => {
          const versionPath = join(pluginPath, version)
          const skillsPath = join(versionPath, 'skills')
          if (!(await exists(skillsPath))) return null
          try {
            return { skillsPath, modifiedAt: (await fs.stat(versionPath)).mtimeMs }
          } catch {
            return null
          }
        }),
      )
      const latest = candidates
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        .sort((a, b) => b.modifiedAt - a.modifiedAt)[0]
      if (!latest) continue
      roots.push({
        agent: 'codex',
        scope: 'user',
        path: latest.skillsPath,
        origin: 'plugin',
        readOnly: true,
      })
    }
  }

  return roots
}

/** Claude plugin roots are authoritative only when present in its installed manifest. */
export async function discoverClaudePluginRoots(homeDir: string = homedir()): Promise<SkillRoot[]> {
  const manifestPath = join(homeDir, '.claude', 'plugins', 'installed_plugins.json')
  let parsed: { plugins?: Record<string, ClaudePluginRecord[]> }
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as typeof parsed
  } catch {
    return []
  }

  const roots: SkillRoot[] = []
  for (const records of Object.values(parsed.plugins ?? {})) {
    if (!Array.isArray(records)) continue
    for (const record of records) {
      if (typeof record.installPath !== 'string') continue
      const isProject = record.scope === 'local' && typeof record.projectPath === 'string'
      roots.push({
        agent: 'claude-code',
        scope: isProject ? 'project' : 'user',
        path: join(record.installPath, 'skills'),
        projectRoot: isProject ? record.projectPath : undefined,
        origin: 'plugin',
        readOnly: true,
      })
    }
  }
  return roots
}

/** Bundled Doubao skills are visible for inventory but owned by the desktop app. */
export function discoverDoubaoSupplementalRoots(homeDir: string = homedir()): SkillRoot[] {
  return [
    {
      agent: 'doubao',
      scope: 'user',
      path: join(
        homeDir,
        'Library',
        'Application Support',
        'Doubao',
        'Default',
        '.doubao',
        'agent_mode',
        'workspace',
        '.skills',
      ),
      origin: 'system',
      readOnly: true,
    },
  ]
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
  const detected = new Set<AgentId>()

  for (const adapter of allAdapters()) {
    if (!(await adapter.detect())) continue
    detected.add(adapter.agent)
    const userPath = adapter.skillsDir('user')
    if (userPath) {
      roots.push({
        agent: adapter.agent,
        scope: 'user',
        path: userPath,
        origin: 'user',
        readOnly: false,
      })
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
      })
    }
  }

  if (detected.has('codex')) roots.push(...(await discoverCodexSupplementalRoots()))
  if (detected.has('claude-code')) roots.push(...(await discoverClaudePluginRoots()))
  if (detected.has('doubao')) roots.push(...discoverDoubaoSupplementalRoots())
  return dedupeRoots(roots)
}

async function scanSkillRoot(root: SkillRoot): Promise<InstalledSkill[]> {
  const skills: InstalledSkill[] = []
  for (const name of await listDirectories(root.path)) {
    const skillPath = join(root.path, name)
    const skill = await readSkillDir(skillPath, name)
    if (!skill) continue
    let modifiedAt: number | undefined
    try {
      modifiedAt = (await fs.stat(join(skillPath, 'SKILL.md'))).mtimeMs
    } catch {
      modifiedAt = undefined
    }
    skills.push({
      skill,
      agent: root.agent,
      scope: root.scope,
      path: skillPath,
      projectRoot: root.projectRoot,
      origin: root.origin,
      readOnly: root.readOnly,
      modifiedAt,
    })
  }
  return skills
}

/** Scan every resolved root and return all locally available skills. */
export async function scanInstalledSkills(
  projectRoots: string[] = [],
): Promise<InstalledSkill[]> {
  const roots = await listSkillRoots(projectRoots)
  return (await Promise.all(roots.map(scanSkillRoot))).flat()
}
