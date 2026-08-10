import type { AgentId } from '../../types.js'
import { defaultMcpProfiles, type McpPlatformProfile } from '../catalog.js'
import { PlatformMcpAdapter } from './platform-adapter.js'
import type { McpAdapter } from './types.js'

const registry = new Map<string, McpAdapter>()

function adapterKey(agent: AgentId, surface: string): string {
  return `${agent}:${surface}`
}

for (const profile of defaultMcpProfiles()) {
  const adapter = new PlatformMcpAdapter(profile)
  registry.set(adapterKey(adapter.agent, adapter.surface), adapter)
}

export function allMcpAdapters(): McpAdapter[] {
  return [...registry.values()]
}

export function getMcpAdapter(agent: AgentId, surface: string): McpAdapter {
  const adapter = registry.get(adapterKey(agent, surface))
  if (!adapter) throw new Error(`unsupported MCP platform surface: ${agent}:${surface}`)
  return adapter
}

/** 注册或覆盖一个 MCP 平台接入面，供内置扩展和测试使用。 */
export function registerMcpProfile(profile: McpPlatformProfile, homeDir?: string): McpAdapter {
  const adapter = new PlatformMcpAdapter(profile, homeDir)
  registry.set(adapterKey(adapter.agent, adapter.surface), adapter)
  return adapter
}

export { PlatformMcpAdapter }
export type { McpAdapter }
