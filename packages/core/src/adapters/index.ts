import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { AgentAdapter, AgentId } from '../types.js'
import { createPlatformAdapter } from './factory.js'
import { PlatformAdapter } from './platform-adapter.js'

const registry = new Map<AgentId, AgentAdapter>(
  BUILTIN_PLATFORMS.map((def) => [def.id, createPlatformAdapter(def)]),
)

export function getAdapter(agent: AgentId): AgentAdapter {
  const adapter = registry.get(agent)
  if (!adapter) throw new Error(`No adapter registered for agent "${agent}"`)
  return adapter
}

export function allAdapters(): AgentAdapter[] {
  return [...registry.values()]
}

/**
 * Register a user-defined platform (from app settings). Re-registering
 * an id replaces the previous adapter, which is also how users override
 * a built-in platform's paths.
 */
export function registerPlatform(def: PlatformDef, homeDir?: string): AgentAdapter {
  const adapter = createPlatformAdapter(def, homeDir)
  registry.set(def.id, adapter)
  return adapter
}

export { PlatformAdapter }
export { createPlatformAdapter, type AdapterFactory } from './factory.js'
export {
  ClaudeCodeAdapter,
  discoverClaudePluginRoots,
} from './claude-code-adapter.js'
export { CodexAdapter, discoverCodexSupplementalRoots } from './codex-adapter.js'
export { DoubaoAdapter, discoverDoubaoSupplementalRoots } from './doubao-adapter.js'
export { HermesAdapter } from './hermes-adapter.js'
export { LingxiAdapter, discoverLingxiSupplementalRoots } from './lingxi-adapter.js'
export { OmpAdapter, discoverOmpSupplementalRoots } from './omp-adapter.js'
export { PiAdapter, discoverPiSupplementalRoots } from './pi-adapter.js'
export { SkillDirAdapter } from './skill-dir-adapter.js'
