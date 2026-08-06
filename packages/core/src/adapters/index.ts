import type { AgentAdapter, AgentId } from '../types.js'
import { ClaudeCodeAdapter } from './claude-code.js'

const adapters: Partial<Record<AgentId, AgentAdapter>> = {
  'claude-code': new ClaudeCodeAdapter(),
  // TODO: codex, opencode, trae, codebuddy, workbuddy
}

export function getAdapter(agent: AgentId): AgentAdapter {
  const adapter = adapters[agent]
  if (!adapter) throw new Error(`No adapter registered for agent "${agent}"`)
  return adapter
}

export function allAdapters(): AgentAdapter[] {
  return Object.values(adapters)
}

export { ClaudeCodeAdapter }
