import type { AgentId } from './types.js'

/**
 * Declarative definition of an agent platform's skills locations.
 * Paths starting with `~/` are resolved against the home directory;
 * `projectSkillsDir` is relative to a project root. This is the single
 * place a platform's on-disk convention lives — built-in platforms are
 * rows in BUILTIN_PLATFORMS, user-defined ("custom") platforms are the
 * same shape supplied at runtime. Sources and confidence levels for the
 * built-in rows are documented in docs/platform-conventions.md.
 */
export interface PlatformDef {
  id: AgentId
  displayName: string
  /** User-scope skills directory, `~/`-prefixed. null = no user scope. */
  userSkillsDir: string | null
  /** Project-scope skills directory relative to project root. null = no project scope. */
  projectSkillsDir: string | null
  /** Presence of this `~/`-prefixed path marks the platform as installed. */
  detectPath: string
}

export const BUILTIN_PLATFORMS: readonly PlatformDef[] = [
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    userSkillsDir: '~/.claude/skills',
    projectSkillsDir: '.claude/skills',
    detectPath: '~/.claude',
  },
  {
    id: 'codex',
    displayName: 'Codex',
    // Official convention is the cross-tool shared dir (.agents/skills),
    // not the ~/.codex/skills path from early community tutorials.
    userSkillsDir: '~/.agents/skills',
    projectSkillsDir: '.agents/skills',
    detectPath: '~/.codex',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    userSkillsDir: '~/.cursor/skills',
    projectSkillsDir: '.cursor/skills',
    detectPath: '~/.cursor',
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    userSkillsDir: '~/.config/opencode/skills',
    projectSkillsDir: '.opencode/skills',
    detectPath: '~/.config/opencode',
  },
  {
    id: 'workbuddy',
    displayName: 'WorkBuddy',
    // Desktop assistant — no per-project scope. Deliberately the
    // tutorial-consistent path, not the competitor's skills-marketplace
    // subdir (their issue #343). Pending real-machine verification.
    userSkillsDir: '~/.workbuddy/skills',
    projectSkillsDir: null,
    detectPath: '~/.workbuddy',
  },
]
