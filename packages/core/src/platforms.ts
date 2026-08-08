import type { AgentId } from './types.js'

/**
 * Declarative definition of an agent platform's skills locations.
 * Paths starting with `~/` are resolved against the home directory;
 * `projectSkillsDir` is relative to a project root. This is the single
 * place a platform's writable installation convention lives. Read-only
 * system and plugin roots are resolved separately by the scanner. Built-in
 * platforms are rows in BUILTIN_PLATFORMS; user-defined ("custom") platforms
 * use the same shape at runtime. Sources and confidence levels are documented
 * in docs/platform-conventions.md.
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
    id: 'copilot',
    displayName: 'GitHub Copilot',
    // .github/skills is the path recognized across CLI, agent mode and
    // code review; VS Code additionally reads .agents/.claude skills.
    userSkillsDir: '~/.copilot/skills',
    projectSkillsDir: '.github/skills',
    detectPath: '~/.copilot',
  },
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    userSkillsDir: '~/.gemini/skills',
    projectSkillsDir: '.gemini/skills',
    detectPath: '~/.gemini',
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    userSkillsDir: '~/.codebuddy/skills',
    projectSkillsDir: '.codebuddy/skills',
    detectPath: '~/.codebuddy',
  },
  {
    id: 'trae',
    displayName: 'Trae',
    userSkillsDir: '~/.trae/skills',
    projectSkillsDir: '.trae/skills',
    detectPath: '~/.trae',
  },
  {
    // The China edition keeps a separate home dir from international Trae.
    id: 'trae-cn',
    displayName: 'Trae CN',
    userSkillsDir: '~/.trae-cn/skills',
    projectSkillsDir: '.trae/skills',
    detectPath: '~/.trae-cn',
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
  {
    id: 'doubao',
    displayName: '豆包',
    /** The desktop app creates this user-visible directory for imported skills. */
    userSkillsDir: '~/Doubao/skills',
    projectSkillsDir: null,
    detectPath: '~/Doubao',
  },
  {
    id: 'kimi',
    displayName: 'Kimi Code',
    userSkillsDir: '~/.kimi/skills',
    projectSkillsDir: '.kimi/skills',
    detectPath: '~/.kimi',
  },
  {
    id: 'zcode',
    displayName: 'Z Code',
    userSkillsDir: '~/.zcode/skills',
    projectSkillsDir: '.zcode/skills',
    detectPath: '~/.zcode',
  },
]
