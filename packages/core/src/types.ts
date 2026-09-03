/** Built-in agent platforms (rows in BUILTIN_PLATFORMS). */
export type BuiltinAgentId =
  | 'claude-code'
  | 'codex'
  | 'copilot'
  | 'cursor'
  | 'gemini-cli'
  | 'qwen-code'
  | 'opencode'
  | 'pi'
  | 'omp'
  | 'trae'
  | 'trae-cn'
  | 'codebuddy'
  | 'workbuddy'
  | 'doubao'
  | 'kimi'
  | 'zcode'
  | 'deepseek-harness'
  | 'hermes'
  | 'wps-lingxi'

/** An agent platform id: a built-in id (with autocomplete) or any custom string. */
export type AgentId = BuiltinAgentId | (string & {})

/** Canonical, platform-neutral representation of a skill. */
export interface Skill {
  /** kebab-case unique name */
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
  /** Markdown body - the instructions themselves. */
  content: string
  /** Additional files shipped alongside the skill (relative path -> absolute source path). */
  resources?: Record<string, string>
  metadata?: Record<string, unknown>
}

/** A frontmatter parse failure on one SKILL.md, surfaced instead of silently dropped. */
export interface SkillParseWarning {
  /** Absolute path of the file that failed to parse. */
  path: string
  message: string
  /** 1-based line reported by the YAML parser, when available. */
  line?: number
}

/** Where a skill can be installed for a given agent. */
export type InstallScope = 'user' | 'project'

/** How a discovered skill is managed on disk. */
export type SkillOrigin = InstallScope | 'shared' | 'legacy' | 'admin' | 'system' | 'plugin'

/** How a linked Skill's directory entry is owned, deciding whether it may be moved. */
export type SkillLinkKind =
  /** 用户或上游建立的引用，链接条目归本平台目录所有，可停放启停。 */
  | 'reference'
  /** 平台运行态投影（如灵犀 target_skills），平台会全量重建，绝不可触碰。 */
  | 'runtime'

/** Additional, non-managed skill root exposed by an agent runtime. */
export interface SupplementalSkillRoot {
  scope: InstallScope
  path: string
  projectRoot?: string
  origin: SkillOrigin
  readOnly: boolean
  /** Whether the platform rebuilds this root's links itself, so they must not be moved. */
  runtimeProjection?: boolean
}

/** A discovered Skill root, including read-only supplemental platform roots. */
export interface SkillRoot extends SupplementalSkillRoot {
  agent: AgentId
  /** Whether SkillBuddy can safely toggle discovered installations from this root. */
  canToggle?: boolean
}

/** A skill discovered on disk in some agent's native location. */
export interface InstalledSkill {
  skill: Skill
  agent: AgentId
  scope: InstallScope
  /** Absolute path of the installed skill (file or directory). */
  path: string
  /** Project root this installation belongs to (project scope only). */
  projectRoot?: string
  /** Physical source category, used to distinguish managed and read-only skills. */
  origin?: SkillOrigin
  /** System, administrator and plugin-owned skills cannot be edited or removed here. */
  readOnly?: boolean
  /** Whether the installation is discoverable by the target agent. */
  enabled?: boolean
  /** Whether SkillBuddy can safely toggle this installation. */
  canToggle?: boolean
  /** Whether the directory entry is a symlink pointing at an upstream-owned Skill. */
  linked?: boolean
  /** How the link is owned, deciding whether SkillBuddy may park it to disable it. */
  linkKind?: SkillLinkKind
  /** Absolute path the link points at, for display and diagnostics. */
  linkTarget?: string
  /** Whether the link target is missing, so the Skill can neither be read nor enabled. */
  linkBroken?: boolean
  /**
   * frontmatter 解析失败时的诊断。
   *
   * 此时 `skill` 只是兜底占位（名称取目录名、描述与正文为空），条目仍会出现在列表里，
   * 以便用户看得见并去修文件，而不是让它静默消失。
   */
  parseError?: SkillParseWarning
  /** SKILL.md mtime, ms since epoch. */
  modifiedAt?: number
}

/** Agent capabilities that differ from the default SkillBuddy behavior. */
export interface AdapterCapabilities {
  /** Whether the agent supports enabling and disabling installed skills. */
  canToggle?: boolean
}

/** Adapter for one agent platform and its on-disk Skill conventions. */
export interface AgentAdapter {
  readonly agent: AgentId
  readonly displayName: string
  /** Whether the adapter supports SkillBuddy's file-based enable/disable flow. */
  readonly supportsToggle?: boolean
  readonly capabilities?: AdapterCapabilities
  /** Additional read-only or derived roots owned by the platform. */
  supplementalRoots?: (projectRoots?: string[]) => SkillRoot[] | Promise<SkillRoot[]>
  /** Compatibility hook for adapters exposing roots without their agent id. */
  supplementalSkillRoots?(): Promise<SupplementalSkillRoot[]> | SupplementalSkillRoot[]
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
  /** Enable or disable an installed skill without removing its files. */
  setEnabled(name: string, enabled: boolean, scope: InstallScope, projectRoot?: string): Promise<void>
  /** Apply platform-specific visibility rules to this agent's scanned installations. */
  reconcileInstallations?(installations: InstalledSkill[]): InstalledSkill[]
  /** Synchronize platform-owned runtime state after a skill directory changes. */
  refreshRuntime?(): Promise<void>
}
