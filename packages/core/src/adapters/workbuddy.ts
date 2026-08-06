import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallScope } from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'

/**
 * WorkBuddy (Tencent CodeBuddy family desktop assistant) reads
 * SKILL.md-style skills from ~/.workbuddy/skills/<name>/ (consistent
 * across independent tutorials; official docs don't state the path).
 * It is a desktop assistant, not a per-project coding tool, so there is
 * no project scope. Note: a competing manager writes to
 * ~/.workbuddy/skills-marketplace/skills, which mismatches every
 * tutorial and likely explains its "skills not recognized" reports.
 */
export class WorkBuddyAdapter extends SkillDirAdapter {
  readonly agent = 'workbuddy' as const
  readonly displayName = 'WorkBuddy'

  constructor(private readonly homeDir: string = homedir()) {
    super()
  }

  skillsDir(scope: InstallScope): string | null {
    if (scope === 'user') return join(this.homeDir, '.workbuddy', 'skills')
    return null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.homeDir, '.workbuddy'))
  }
}
