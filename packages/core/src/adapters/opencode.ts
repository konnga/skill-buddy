import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallScope } from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'

/**
 * OpenCode natively supports the SKILL.md convention
 * (https://opencode.ai/docs/skills/): user scope at
 * ~/.config/opencode/skills/<name>/SKILL.md, project scope at
 * <project>/.opencode/skills/<name>/SKILL.md. Skill folder name must
 * equal frontmatter `name` (kebab-case), which SkillDirAdapter enforces.
 */
export class OpenCodeAdapter extends SkillDirAdapter {
  readonly agent = 'opencode' as const
  readonly displayName = 'OpenCode'

  constructor(private readonly homeDir: string = homedir()) {
    super()
  }

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(this.homeDir, '.config', 'opencode', 'skills')
    return projectRoot ? join(projectRoot, '.opencode', 'skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.homeDir, '.config', 'opencode'))
  }
}
