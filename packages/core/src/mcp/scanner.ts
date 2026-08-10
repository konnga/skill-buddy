import { aggregateMcpServers } from './aggregate.js'
import { allMcpAdapters } from './adapters/index.js'
import type { McpAdapter } from './adapters/types.js'
import type {
  McpInstallation,
  McpPlatformStatus,
  McpScanError,
  McpScanResult,
} from './types.js'

function scanError(error: unknown, adapter: McpAdapter, sourceId?: string): McpScanError {
  const candidate = error as { code?: unknown; message?: unknown }
  return {
    agent: adapter.agent,
    surface: adapter.surface,
    sourceId,
    code: typeof candidate?.code === 'string' ? candidate.code : 'MCP_SCAN_FAILED',
    message:
      typeof candidate?.message === 'string' ? candidate.message : String(error ?? 'unknown error'),
  }
}

/** 扫描所有 MCP 配置来源；单一来源损坏不会阻断其他平台结果。 */
export async function scanMcpServers(
  projectRoots: string[] = [],
  adapters: readonly McpAdapter[] = allMcpAdapters(),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<McpScanResult> {
  const installations: McpInstallation[] = []
  const errors: McpScanError[] = []

  const platforms: McpPlatformStatus[] = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return {
          agent: adapter.agent,
          surface: adapter.surface,
          displayName: adapter.displayName,
          detected: await adapter.detect(projectRoots),
          capabilities: adapter.capabilities,
        }
      } catch (error) {
        errors.push(scanError(error, adapter))
        return {
          agent: adapter.agent,
          surface: adapter.surface,
          displayName: adapter.displayName,
          detected: false,
          capabilities: adapter.capabilities,
        }
      }
    }),
  )

  await Promise.all(
    adapters.map(async (adapter) => {
      let sources
      try {
        sources = await adapter.configSources(projectRoots)
      } catch (error) {
        errors.push(scanError(error, adapter))
        return
      }
      await Promise.all(
        sources.map(async (source) => {
          if (!source.exists) return
          try {
            installations.push(...(await adapter.read(source, environment)))
          } catch (error) {
            errors.push(scanError(error, adapter, source.id))
          }
        }),
      )
    }),
  )

  return {
    installations,
    servers: aggregateMcpServers(installations),
    platforms,
    errors,
  }
}
