import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { resolveResourcePath } from '../resource-path.js'
import type { AgentAdapter, AgentId, InstallScope, InstalledSkill, Skill } from '../types.js'
import {
  DISABLED_SKILL_FILE_NAME,
  readSkillDirState,
  SKILL_FILE_NAME,
} from '../skill-io.js'
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
      const state = await readSkillDirState(skillPath, entry.name)
      if (!state) continue
      let modifiedAt: number | undefined
      try {
        modifiedAt = (
          await fs.stat(join(skillPath, state.enabled ? SKILL_FILE_NAME : DISABLED_SKILL_FILE_NAME))
        ).mtimeMs
      } catch {
        modifiedAt = undefined
      }
      skills.push({
        agent: this.agent,
        scope,
        path: skillPath,
        origin: scope,
        readOnly: false,
        enabled: state.enabled,
        modifiedAt,
        skill: state.skill,
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
    await fs.mkdir(dir, { recursive: true })
    const stagingPath = await fs.mkdtemp(join(dir, '.skillbuddy-install-'))
    const backupPath = `${stagingPath}-previous`
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description,
    }
    if (skill.version) frontmatter.version = skill.version
    if (skill.tags?.length) frontmatter.tags = skill.tags
    const raw = matter.stringify(`\n${skill.content}\n`, frontmatter)
    try {
      if (skill.resources) {
        for (const [rel, src] of Object.entries(skill.resources)) {
          const dest = resolveResourcePath(stagingPath, rel)
          await fs.mkdir(dirname(dest), { recursive: true })
          await fs.copyFile(src, dest)
        }
      }
      await fs.writeFile(join(stagingPath, SKILL_FILE_NAME), raw, 'utf8')
      const hadPrevious = await exists(skillPath)
      if (hadPrevious) await fs.rename(skillPath, backupPath)
      try {
        await fs.rename(stagingPath, skillPath)
      } catch (error) {
        if (hadPrevious) await fs.rename(backupPath, skillPath)
        throw error
      }
      if (hadPrevious) await fs.rm(backupPath, { recursive: true, force: true }).catch(() => undefined)
    } catch (error) {
      await fs.rm(stagingPath, { recursive: true, force: true })
      throw error
    }
    return skillPath
  }

  async uninstall(name: string, scope: InstallScope, projectRoot?: string): Promise<void> {
    if (!isKebabCase(name)) throw new Error(`skill name must be kebab-case, got "${name}"`)
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir) return
    await fs.rm(join(dir, name), { recursive: true, force: true })
  }

  async setEnabled(
    name: string,
    enabled: boolean,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<void> {
    if (!isKebabCase(name)) throw new Error(`skill name must be kebab-case, got "${name}"`)
    const dir = this.skillsDir(scope, projectRoot)
    if (!dir) throw new Error(`${this.agent}: no skills directory for scope "${scope}"`)
    const skillPath = join(dir, name)
    const activePath = join(skillPath, SKILL_FILE_NAME)
    const disabledPath = join(skillPath, DISABLED_SKILL_FILE_NAME)
    if (enabled) {
      if (await exists(activePath)) {
        await fs.rm(disabledPath, { force: true })
        return
      }
      if (!(await exists(disabledPath))) throw new Error(`skill not found: ${name}`)
      await fs.rename(disabledPath, activePath)
      return
    }
    if (await exists(disabledPath)) {
      await fs.rm(activePath, { force: true })
      return
    }
    if (!(await exists(activePath))) throw new Error(`skill not found: ${name}`)
    await fs.rename(activePath, disabledPath)
  }
}
