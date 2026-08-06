import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallScope } from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'

/**
 * Cursor (2.4+) natively supports Agent Skills
 * (https://cursor.com/docs/skills): user scope at
 * ~/.cursor/skills/<name>/SKILL.md, project scope at
 * <project>/.cursor/skills/<name>/SKILL.md. Frontmatter `name` must be
 * lowercase kebab-case and match the folder name, which
 * SkillDirAdapter enforces.
 */
export class CursorAdapter extends SkillDirAdapter {
  readonly agent = 'cursor' as const
  readonly displayName = 'Cursor'

  constructor(private readonly homeDir: string = homedir()) {
    super()
  }

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(this.homeDir, '.cursor', 'skills')
    return projectRoot ? join(projectRoot, '.cursor', 'skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.homeDir, '.cursor'))
  }
}
