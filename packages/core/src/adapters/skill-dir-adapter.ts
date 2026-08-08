import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import type { AgentAdapter, AgentId, InstallScope, InstalledSkill, Skill } from '../types.js'
import { readSkillDir } from '../skill-io.js'
import { exists, isKebabCase } from './shared.js'

/**
 * Base adapter for platforms following the SKILL.md folder convention
 * (a directory per skill containing SKILL.md with YAML frontmatter).
 * Subclasses provide agent identity, directory resolution and detection.
 */
export abstract class SkillDirAdapter implements AgentAdapter {
  abstract readonly agent: AgentId
  abstract readonly displayName: string

  abstract skillsDir(scope: InstallScope, projectRoot?: string): string | null
  abstract detect(): Promise<boolean>

  async list(scope: InstallScope, projectRoot?: string): Promise<InstalledSkill[]> {
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir || !(await exists(dir))) return []
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const skills: InstalledSkill[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = join(dir, entry.name)
      const skill = await readSkillDir(skillPath, entry.name)
      if (!skill) continue
      let modifiedAt: number | undefined
      try {
        modifiedAt = (await fs.stat(join(skillPath, 'SKILL.md'))).mtimeMs
      } catch {
        modifiedAt = undefined
      }
      skills.push({
        agent: this.agent,
        scope,
        path: skillPath,
        origin: scope,
        readOnly: false,
        modifiedAt,
        skill,
      })
    }
    return skills
  }

  async install(skill: Skill, scope: InstallScope, projectRoot?: string): Promise<string> {
    if (!isKebabCase(skill.name)) {
      throw new Error(`skill name must be kebab-case, got "${skill.name}"`)
    }
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir) throw new Error(`${this.agent}: no skills directory for scope "${scope}"`)
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
