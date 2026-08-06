import type { AgentAdapter, AgentId } from '../types.js'
import { ClaudeCodeAdapter } from './claude-code.js'
import { CodexAdapter } from './codex.js'
import { CursorAdapter } from './cursor.js'
import { OpenCodeAdapter } from './opencode.js'
import { WorkBuddyAdapter } from './workbuddy.js'

const adapters: Partial<Record<AgentId, AgentAdapter>> = {
  'claude-code': new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
  cursor: new CursorAdapter(),
  opencode: new OpenCodeAdapter(),
  workbuddy: new WorkBuddyAdapter(),
}

export function getAdapter(agent: AgentId): AgentAdapter {
  const adapter = adapters[agent]
  if (!adapter) throw new Error(`No adapter registered for agent "${agent}"`)
  return adapter
}

export function allAdapters(): AgentAdapter[] {
  return Object.values(adapters)
}

export { ClaudeCodeAdapter, CodexAdapter, CursorAdapter, OpenCodeAdapter, WorkBuddyAdapter }
export { SkillDirAdapter } from './skill-dir-adapter.js'
