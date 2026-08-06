import type { AgentAdapter, AgentId } from '../types.js'
import { ClaudeCodeAdapter } from './claude-code.js'
import { CursorAdapter } from './cursor.js'
import { OpenCodeAdapter } from './opencode.js'

const adapters: Partial<Record<AgentId, AgentAdapter>> = {
  'claude-code': new ClaudeCodeAdapter(),
  cursor: new CursorAdapter(),
  opencode: new OpenCodeAdapter(),
  // TODO: codex, workbuddy
}

export function getAdapter(agent: AgentId): AgentAdapter {
  const adapter = adapters[agent]
  if (!adapter) throw new Error(`No adapter registered for agent "${agent}"`)
  return adapter
}

export function allAdapters(): AgentAdapter[] {
  return Object.values(adapters)
}

export { ClaudeCodeAdapter, CursorAdapter, OpenCodeAdapter }
export { SkillDirAdapter } from './skill-dir-adapter.js'
