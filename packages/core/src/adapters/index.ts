import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { AgentAdapter, AgentId } from '../types.js'
import { PlatformAdapter } from './platform-adapter.js'

const registry = new Map<AgentId, AgentAdapter>(
  BUILTIN_PLATFORMS.map((def) => [def.id, new PlatformAdapter(def)]),
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
  const adapter = new PlatformAdapter(def, homeDir)
  registry.set(def.id, adapter)
  return adapter
}

export { PlatformAdapter }
export { SkillDirAdapter } from './skill-dir-adapter.js'
