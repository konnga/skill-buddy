/** Built-in agent platforms (rows in BUILTIN_PLATFORMS). */
export type BuiltinAgentId =
  | 'claude-code'
  | 'codex'
  | 'copilot'
  | 'cursor'
  | 'gemini-cli'
  | 'opencode'
  | 'trae'
  | 'trae-cn'
  | 'codebuddy'
  | 'workbuddy'

/**
 * An agent platform id: a built-in id (with autocomplete) or any string
 * for user-defined custom platforms.
 */
export type AgentId = BuiltinAgentId | (string & {})

/** Canonical, platform-neutral representation of a skill. */
export interface Skill {
  /** kebab-case unique name */
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
  /** Markdown body — the instructions themselves. */
  content: string
  /** Additional files shipped alongside the skill (relative path -> absolute source path). */
  resources?: Record<string, string>
  metadata?: Record<string, unknown>
}

/** Where a skill can be installed for a given agent. */
export type InstallScope = 'user' | 'project'

/** A skill discovered on disk in some agent's native location. */
export interface InstalledSkill {
  skill: Skill
  agent: AgentId
  scope: InstallScope
  /** Absolute path of the installed skill (file or directory). */
  path: string
  /** Project root this installation belongs to (project scope only). */
  projectRoot?: string
}

/**
 * Adapter for one agent platform: knows the platform's on-disk conventions
 * and converts to/from the canonical skill format.
 */
export interface AgentAdapter {
  readonly agent: AgentId
  readonly displayName: string
  /** Directory that holds skills for the given scope; null if unsupported. */
  skillsDir(scope: InstallScope, projectRoot?: string): string | null
  /** Whether this agent appears to be present on this machine. */
  detect(): Promise<boolean>
  /** List skills installed in the agent's native location. */
  list(scope: InstallScope, projectRoot?: string): Promise<InstalledSkill[]>
  /** Write a canonical skill into the agent's native format. Returns the install path. */
  install(skill: Skill, scope: InstallScope, projectRoot?: string): Promise<string>
  /** Remove an installed skill by name. */
  uninstall(name: string, scope: InstallScope, projectRoot?: string): Promise<void>
}
