import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { AgentAdapter, InstallScope, InstalledSkill, Skill } from '../types.js'

/**
 * Claude Code stores skills as directories containing a SKILL.md with
 * YAML frontmatter (name, description), under ~/.claude/skills (user)
 * or <project>/.claude/skills (project).
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly agent = 'claude-code' as const
  readonly displayName = 'Claude Code'

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(homedir(), '.claude', 'skills')
    return projectRoot ? join(projectRoot, '.claude', 'skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(homedir(), '.claude'))
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
      const raw = await fs.readFile(skillFile, 'utf8')
      const { data, content } = matter(raw)
      skills.push({
        agent: this.agent,
        scope,
        path: skillPath,
        skill: {
          name: typeof data.name === 'string' ? data.name : entry.name,
          description: typeof data.description === 'string' ? data.description : '',
          version: typeof data.version === 'string' ? data.version : undefined,
          content: content.trim(),
          metadata: data,
        },
      })
    }
    return skills
  }

  async install(skill: Skill, scope: InstallScope, projectRoot?: string): Promise<string> {
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir) throw new Error(`claude-code: no skills directory for scope "${scope}"`)
    const skillPath = join(dir, skill.name)
    await fs.mkdir(skillPath, { recursive: true })
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description,
    }
    if (skill.version) frontmatter.version = skill.version
    const raw = matter.stringify(`\n${skill.content}\n`, frontmatter)
    await fs.writeFile(join(skillPath, 'SKILL.md'), raw, 'utf8')
    if (skill.resources) {
      for (const [rel, src] of Object.entries(skill.resources)) {
        const dest = join(skillPath, rel)
        await fs.mkdir(join(dest, '..'), { recursive: true })
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

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}
