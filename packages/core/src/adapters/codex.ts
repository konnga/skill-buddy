import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstallScope } from '../types.js'
import { exists } from './shared.js'
import { SkillDirAdapter } from './skill-dir-adapter.js'

/**
 * OpenAI Codex CLI supports the open agent-skills standard
 * (https://developers.openai.com/codex/skills). Official scan locations
 * are the cross-tool shared dirs: ~/.agents/skills (user) and
 * <project>/.agents/skills (project) — NOT ~/.codex/skills, which only
 * appears in early community tutorials. Detection keys off $CODEX_HOME
 * (default ~/.codex, which holds config.toml/auth.json).
 */
export class CodexAdapter extends SkillDirAdapter {
  readonly agent = 'codex' as const
  readonly displayName = 'Codex'

  constructor(private readonly homeDir: string = homedir()) {
    super()
  }

  skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(this.homeDir, '.agents', 'skills')
    return projectRoot ? join(projectRoot, '.agents', 'skills') : null
  }

  async detect(): Promise<boolean> {
    return exists(join(this.homeDir, '.codex'))
  }
}
