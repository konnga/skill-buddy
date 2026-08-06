import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import type { AgentAdapter, InstallScope, InstalledSkill, Skill } from '../types.js'
import { exists, isKebabCase } from './shared.js'

/**
 * Claude Code stores skills as directories containing a SKILL.md with
 * YAML frontmatter (name, description), under ~/.claude/skills (user)
 * or <project>/.claude/skills (project).
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly agent = 'claude-code' as const
  readonly displayName = 'Claude Code'

  constructor(private readonly homeDir: string = homedir()) {}

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(this.homeDir, '.claude', 'skills')
    return projectRoot ? join(projectRoot, '.claude', 'skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.homeDir, '.claude'))
  }

  async list(scope: InstallScope, projectRoot?: string): Promise<InstalledSkill[]> {
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir || !(await exists(dir))) return []
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const skills: InstalledSkill[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = join(dir, entry.name)
      const skillFile = join(skillPath, 'SKILL.md')
      if (!(await exists(skillFile))) continue
      let raw: string
      try {
        raw = await fs.readFile(skillFile, 'utf8')
      } catch {
        continue
      }
      const { data, content } = matter(raw)
      const resources = await collectResources(skillPath)
      skills.push({
        agent: this.agent,
        scope,
        path: skillPath,
        skill: {
          name: typeof data.name === 'string' ? data.name : entry.name,
          description: typeof data.description === 'string' ? data.description : '',
          version: typeof data.version === 'string' ? data.version : undefined,
          tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string') : undefined,
          content: content.trim(),
          resources,
          metadata: data,
        },
      })
    }
    return skills
  }

  async install(skill: Skill, scope: InstallScope, projectRoot?: string): Promise<string> {
    if (!isKebabCase(skill.name)) {
      throw new Error(`skill name must be kebab-case, got "${skill.name}"`)
    }
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir) throw new Error(`claude-code: no skills directory for scope "${scope}"`)
    const skillPath = join(dir, skill.name)
    await fs.mkdir(skillPath, { recursive: true })
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description,
    }
    if (skill.version) frontmatter.version = skill.version
    if (skill.tags?.length) frontmatter.tags = skill.tags
    const raw = matter.stringify(`\n${skill.content}\n`, frontmatter)
    await fs.writeFile(join(skillPath, 'SKILL.md'), raw, 'utf8')
    if (skill.resources) {
      for (const [rel, src] of Object.entries(skill.resources)) {
        const dest = join(skillPath, rel)
        await fs.mkdir(dirname(dest), { recursive: true })
        await fs.copyFile(src, dest)
      }
    }
    return skillPath
  }

  async uninstall(name: string, scope: InstallScope, projectRoot?: string): Promise<void> {
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir) return
    await fs.rm(join(dir, name), { recursive: true, force: true })
  }
}

/** Walk a skill directory and collect non-SKILL.md files as resources. */
async function collectResources(
  skillPath: string,
): Promise<Record<string, string> | undefined> {
  const resources: Record<string, string> = {}
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel)
      } else if (rel !== 'SKILL.md') {
        resources[rel] = join(dir, entry.name)
      }
    }
  }
  await walk(skillPath, '')
  return Object.keys(resources).length > 0 ? resources : undefined
}
