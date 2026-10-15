import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { AgentAdapter, AgentId } from '../types.js'
import { createPlatformAdapter } from './factory.js'
import { PlatformAdapter } from './platform-adapter.js'

const registry = new Map<AgentId, AgentAdapter>(
  BUILTIN_PLATFORMS.map((def) => [def.id, createPlatformAdapter(def)]),
)

/**
 * 适配器之外的原始定义，与 registry 同步维护。
 *
 * 残留判定要读 `installPathsByOs` / `residualPathsByOs`，而这两个字段刻意不进
 * `AgentAdapter` 接口（它们只描述文件系统约定，与读写技能无关）。因此这里按
 * 平台 id 保留定义，供扫描器解析「本体在哪、哪些目录归它所有」。
 */
const definitions = new Map<AgentId, PlatformDef>(
  BUILTIN_PLATFORMS.map((def) => [def.id, def]),
)

export function getAdapter(agent: AgentId): AgentAdapter {
  const adapter = registry.get(agent)
  if (!adapter) throw new Error(`No adapter registered for agent "${agent}"`)
  return adapter
}

export function allAdapters(): AgentAdapter[] {
  return [...registry.values()]
}

/** Every registered platform definition, built-in and user-defined. */
export function allPlatformDefs(): PlatformDef[] {
  return [...definitions.values()]
}

/**
 * Register a user-defined platform (from app settings). Re-registering
 * an id replaces the previous adapter, which is also how users override
 * a built-in platform's paths. Runtime registrations never acquire cleanup
 * metadata, even when overriding a built-in id; only built-in definitions are trusted.
 */
export function registerPlatform(def: PlatformDef, homeDir?: string): AgentAdapter {
  const registeredDef: PlatformDef = {
    id: def.id,
    displayName: def.displayName,
    userSkillsDir: def.userSkillsDir,
    userSkillsDirByOs: def.userSkillsDirByOs && { ...def.userSkillsDirByOs },
    projectSkillsDir: def.projectSkillsDir,
    detectPath: def.detectPath,
    detectPathByOs: def.detectPathByOs && { ...def.detectPathByOs },
  }
  const adapter = createPlatformAdapter(registeredDef, homeDir)
  registry.set(def.id, adapter)
  definitions.set(def.id, registeredDef)
  return adapter
}

export { PlatformAdapter }
export { createPlatformAdapter, type AdapterFactory } from './factory.js'
export {
  ClaudeCodeAdapter,
  discoverClaudePluginRoots,
} from './claude-code-adapter.js'
export { CodexAdapter, discoverCodexSupplementalRoots } from './codex-adapter.js'
export {
  DeepSeekHarnessAdapter,
  discoverDeepSeekHarnessSupplementalRoots,
} from './deepseek-harness-adapter.js'
export { DoubaoAdapter, discoverDoubaoSupplementalRoots } from './doubao-adapter.js'
export { LingxiAdapter, discoverLingxiSupplementalRoots } from './lingxi-adapter.js'
export { OmpAdapter, discoverOmpSupplementalRoots } from './omp-adapter.js'
export { PiAdapter, discoverPiSupplementalRoots } from './pi-adapter.js'
export { SkillDirAdapter } from './skill-dir-adapter.js'
