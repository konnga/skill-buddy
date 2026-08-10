import type { AgentId } from '../../types.js'
import type { McpPlatformProfile } from '../catalog.js'
import type {
  McpConfigSource,
  McpInstallation,
  McpPlatformCapabilities,
} from '../types.js'
import type {
  McpPreparedMutation,
  McpProjection,
  McpTarget,
} from '../operations.js'

/** 一个 Agent 接入面的 MCP 读取适配器。 */
export interface McpAdapter {
  readonly agent: AgentId
  readonly surface: string
  readonly displayName: string
  readonly capabilities: McpPlatformCapabilities
  readonly profile: McpPlatformProfile

  detect(projectRoots?: string[]): Promise<boolean>
  configSources(projectRoots?: string[]): Promise<McpConfigSource[]>
  read(
    source: McpConfigSource,
    environment?: NodeJS.ProcessEnv,
  ): Promise<McpInstallation[]>
  project(definition: McpInstallation['definition'], target: McpTarget): McpProjection
  prepareUpsert(
    definition: McpInstallation['definition'],
    target: McpTarget,
  ): Promise<McpPreparedMutation>
  prepareRemove(name: string, target: McpTarget): Promise<McpPreparedMutation>
  prepareToggle(name: string, enabled: boolean, target: McpTarget): Promise<McpPreparedMutation>
}
