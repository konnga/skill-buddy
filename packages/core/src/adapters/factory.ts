import type { PlatformDef } from '../platforms.js'
import type { AgentAdapter, AgentId } from '../types.js'
import { ClaudeCodeAdapter } from './claude-code-adapter.js'
import { CodexAdapter } from './codex-adapter.js'
import { DoubaoAdapter } from './doubao-adapter.js'
import { HermesAdapter } from './hermes-adapter.js'
import { LingxiAdapter } from './lingxi-adapter.js'
import { OmpAdapter } from './omp-adapter.js'
import { PiAdapter } from './pi-adapter.js'
import { PlatformAdapter } from './platform-adapter.js'

export type AdapterFactory = (def: PlatformDef, homeDir?: string) => AgentAdapter

const builtinFactories: Partial<Record<AgentId, AdapterFactory>> = {
  'claude-code': (def, homeDir) => new ClaudeCodeAdapter(def, homeDir),
  codex: (def, homeDir) => new CodexAdapter(def, homeDir),
  omp: (def, homeDir) => new OmpAdapter(def, homeDir),
  pi: (def, homeDir) => new PiAdapter(def, homeDir),
  doubao: (def, homeDir) => new DoubaoAdapter(def, homeDir),
  hermes: (def, homeDir) => new HermesAdapter(def, homeDir),
  'wps-lingxi': (def, homeDir) => new LingxiAdapter(def, homeDir),
}

/** Build the dedicated adapter for known platforms, or the generic directory adapter. */
export function createPlatformAdapter(def: PlatformDef, homeDir?: string): AgentAdapter {
  return (builtinFactories[def.id] ?? ((platform, home) => new PlatformAdapter(platform, home)))(
    def,
    homeDir,
  )
}
