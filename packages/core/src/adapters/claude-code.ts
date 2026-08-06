import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallScope } from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'

/**
 * Claude Code stores skills as directories containing a SKILL.md with
 * YAML frontmatter (name, description), under ~/.claude/skills (user)
 * or <project>/.claude/skills (project).
 */
export class ClaudeCodeAdapter extends SkillDirAdapter {
  readonly agent = 'claude-code' as const
  readonly displayName = 'Claude Code'

  constructor(private readonly homeDir: string = homedir()) {
    super()
  }

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(this.homeDir, '.claude', 'skills')
    return projectRoot ? join(projectRoot, '.claude', 'skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.homeDir, '.claude'))
  }
}
