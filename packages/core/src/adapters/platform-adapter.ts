import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PlatformDef } from '../platforms.js'
import type { AgentId, InstallScope } from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'

/** Resolve a `~/`-prefixed path against a home directory. */
function expand(path: string, homeDir: string): string {
  return path.startsWith('~/') ? join(homeDir, path.slice(2)) : path
}

/**
 * Adapter driven entirely by a PlatformDef. All built-in platforms and
 * user-defined custom platforms share this implementation; the SKILL.md
 * read/write logic lives in SkillDirAdapter.
 */
export class PlatformAdapter extends SkillDirAdapter {
  readonly agent: AgentId
  readonly displayName: string

  constructor(
    readonly def: PlatformDef,
    private readonly homeDir: string = homedir(),
  ) {
    super()
    this.agent = def.id
    this.displayName = def.displayName
  }

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') {
      return this.def.userSkillsDir ? expand(this.def.userSkillsDir, this.homeDir) : null
    }
    return this.def.projectSkillsDir && projectRoot
      ? join(projectRoot, this.def.projectSkillsDir)
      : null
  }

  async detect(): Promise<boolean> {
    return exists(expand(this.def.detectPath, this.homeDir))
  }
}
