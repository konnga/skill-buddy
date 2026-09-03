import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { PlatformDef } from '../platforms.js'
import {
  DISABLED_SKILL_FILE_NAME,
  readSkillDirState,
  SKILL_FILE_NAME,
} from '../skill-io.js'
import type { InstallScope, InstalledSkill } from '../types.js'
import { PlatformAdapter } from './platform-adapter.js'
import { exists, isKebabCase } from './shared.js'

/** Hermes 按分类目录组织内置 Skill，需要递归发现实际包含 SKILL.md 的目录。 */
export class HermesAdapter extends PlatformAdapter {
  constructor(def: PlatformDef, homeDir?: string) {
    super(def, homeDir)
  }

  override async list(scope: InstallScope, projectRoot?: string): Promise<InstalledSkill[]> {
    const root = this.skillsDir(scope, projectRoot)
    if (!root || !(await exists(root))) return []
    return this.listDirectory(root, scope, projectRoot)
  }

  override async uninstall(
    name: string,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<void> {
    const installation = await this.findInstallation(name, scope, projectRoot)
    if (!installation) return
    await fs.rm(installation.path, { recursive: true, force: true })
  }

  override async setEnabled(
    name: string,
    enabled: boolean,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<void> {
    const installation = await this.findInstallation(name, scope, projectRoot)
    if (!installation) throw new Error(`skill not found: ${name}`)
    const activePath = join(installation.path, SKILL_FILE_NAME)
    const disabledPath = join(installation.path, DISABLED_SKILL_FILE_NAME)
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

  private async listDirectory(
    directory: string,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<InstalledSkill[]> {
    const state = await readSkillDirState(directory, basename(directory))
    if (state) {
      let modifiedAt: number | undefined
      try {
        modifiedAt = (
          await fs.stat(join(directory, state.enabled ? SKILL_FILE_NAME : DISABLED_SKILL_FILE_NAME))
        ).mtimeMs
      } catch {
        modifiedAt = undefined
      }
      return [{
        agent: this.agent,
        scope,
        path: directory,
        projectRoot: scope === 'project' ? projectRoot : undefined,
        origin: scope,
        readOnly: false,
        canToggle: this.supportsToggle,
        enabled: state.enabled,
        modifiedAt,
        parseError: state.parseError,
        skill: state.skill,
      }]
    }

    const entries = await fs.readdir(directory, { withFileTypes: true })
    const nested = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => this.listDirectory(join(directory, entry.name), scope, projectRoot)))
    return nested.flat()
  }

  private async findInstallation(
    name: string,
    scope: InstallScope,
    projectRoot?: string,
  ): Promise<InstalledSkill | undefined> {
    if (!isKebabCase(name)) throw new Error(`skill name must be kebab-case, got "${name}"`)
    const matches = (await this.list(scope, projectRoot))
      .filter((installation) => installation.skill.name === name)
    if (matches.length > 1) {
      const locations = matches.map((installation) => dirname(installation.path)).join(', ')
      throw new Error(`multiple Hermes skills named "${name}" found in: ${locations}`)
    }
    return matches[0]
  }
}
