import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import type { AgentAdapter, AgentId, InstallScope, InstalledSkill, Skill } from '../types.js'
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
      const skillFile = join(skillPath, 'SKILL.md')
      if (!(await exists(skillFile))) continue
      let raw: string
      let modifiedAt: number | undefined
      try {
        raw = await fs.readFile(skillFile, 'utf8')
        modifiedAt = (await fs.stat(skillFile)).mtimeMs
      } catch {
        continue
      }
      const { data, content } = matter(raw)
      const resources = await collectResources(skillPath)
      skills.push({
        agent: this.agent,
        scope,
        path: skillPath,
        modifiedAt,
        skill: {
          name: typeof data.name === 'string' ? data.name : entry.name,
          description: typeof data.description === 'string' ? data.description : '',
          version: typeof data.version === 'string' ? data.version : undefined,
          tags: Array.isArray(data.tags)
            ? data.tags.filter((t) => typeof t === 'string')
            : undefined,
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
