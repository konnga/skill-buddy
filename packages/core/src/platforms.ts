import type { AgentId } from './types.js'

/** Operating systems a platform may declare OS-specific paths for. */
export type PlatformOs = 'darwin' | 'win32' | 'linux'

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
  /**
   * Per-OS override for `userSkillsDir`, used by platforms that store skills
   * under an OS-specific application data directory (typically Electron apps
   * writing to `app.getPath('userData')`). The entry for the running OS wins;
   * `userSkillsDir` stays the fallback for any OS left unlisted.
   */
  userSkillsDirByOs?: Partial<Record<PlatformOs, string>>
  /** Project-scope skills directory relative to project root. null = no project scope. */
  projectSkillsDir: string | null
  /** Presence of this `~/`-prefixed path marks the platform as installed. */
  detectPath: string
  /** Per-OS override for `detectPath`, resolved like `userSkillsDirByOs`. */
  detectPathByOs?: Partial<Record<PlatformOs, string>>
}

/** Pick the path declared for `os`, falling back to the OS-neutral default. */
export function resolvePlatformOsPath<T extends string | null>(
  fallback: T,
  byOs: Partial<Record<PlatformOs, string>> | undefined,
  os: NodeJS.Platform,
): T | string {
  if (!byOs) return fallback
  return byOs[os as PlatformOs] ?? fallback
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
    // Pi uses an active-agent directory at user scope, but discovers project
    // skills directly below .pi (without the agent segment).
    id: 'pi',
    displayName: 'Pi',
    userSkillsDir: '~/.pi/agent/skills',
    projectSkillsDir: '.pi/skills',
    detectPath: '~/.pi/agent',
  },
  {
    // oh-my-pi follows the same asymmetric convention under its own home.
    id: 'omp',
    displayName: 'OMP Agent',
    userSkillsDir: '~/.omp/agent/skills',
    projectSkillsDir: '.omp/skills',
    detectPath: '~/.omp/agent',
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
    id: 'qwen-code',
    displayName: 'Qwen Code',
    userSkillsDir: '~/.qwen/skills',
    projectSkillsDir: '.qwen/skills',
    detectPath: '~/.qwen',
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
    // 使用官方教程约定的路径，不采用第三方市场缓存目录
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
    displayName: 'ZCode',
    userSkillsDir: '~/.zcode/skills',
    projectSkillsDir: '.zcode/skills',
    detectPath: '~/.zcode',
  },
  {
    id: 'deepseek-harness',
    displayName: 'DeepSeek Harness',
    userSkillsDir: '~/.dsh/skills',
    projectSkillsDir: '.dsh/skills',
    detectPath: '~/.dsh',
  },
  {
    id: 'hermes',
    displayName: 'Hermes',
    userSkillsDir: '~/.hermes/skills',
    projectSkillsDir: '.hermes/skills',
    detectPath: '~/.hermes',
  },
  {
    id: 'wps-lingxi',
    displayName: 'WPS 灵犀',
    // Electron desktop assistant: skills live under app.getPath('userData'),
    // so the location is OS-specific. The macOS row is verified on a real
    // machine (1.2.36 / sandbox 3.23.0); the Windows and Linux rows follow
    // Electron's userData convention and await real-machine verification.
    // Bundled `official_skills` is a read-only sibling resolved by the scanner.
    userSkillsDir: '~/Library/Application Support/WPS 灵犀/serverdir/user_skills',
    userSkillsDirByOs: {
      win32: '~/AppData/Roaming/WPS 灵犀/serverdir/user_skills',
      linux: '~/.config/WPS 灵犀/serverdir/user_skills',
    },
    // Desktop assistant — no per-project scope.
    projectSkillsDir: null,
    detectPath: '~/Library/Application Support/WPS 灵犀',
    detectPathByOs: {
      win32: '~/AppData/Roaming/WPS 灵犀',
      linux: '~/.config/WPS 灵犀',
    },
  },
]
