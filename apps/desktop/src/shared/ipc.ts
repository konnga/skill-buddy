import type { AgentId, InstallScope } from '@skills-manager/core'

/** A (platform, scope) pair an install/uninstall operation applies to. */
export interface InstallTarget {
  agent: AgentId
  scope: InstallScope
  /** Required when scope is "project". */
  projectRoot?: string
}

/** A user-defined platform definition persisted in settings. */
export interface CustomPlatformInput {
  id: string
  displayName: string
  userSkillsDir: string | null
  projectSkillsDir: string | null
  detectPath: string
}

/** Per-target outcome of an install/uninstall operation. */
export interface TargetResult {
  target: InstallTarget
  ok: boolean
  error?: string
}
