import type {
  AggregatedMcpServer,
  McpConflictKind,
  McpInstallation,
} from './types.js'

function conflictKind(installations: McpInstallation[]): McpConflictKind | undefined {
  const definitions = installations.map((installation) => installation.definition)
  const transportKinds = new Set(definitions.map((definition) => definition.transport.kind))
  if (transportKinds.size > 1) return 'transport'

  const first = definitions[0]
  if (!first) return undefined
  if (first.transport.kind === 'stdio') {
    const commands = new Set(
      definitions.map((definition) =>
        definition.transport.kind === 'stdio' ? definition.transport.command : '',
      ),
    )
    if (commands.size > 1) return 'command'
  } else {
    const endpoints = new Set(
      definitions.map((definition) =>
        definition.transport.kind === 'stdio' ? '' : definition.transport.url,
      ),
    )
    if (endpoints.size > 1) return 'endpoint'
  }

  const credentials = new Set(
    definitions.map((definition) => definition.requiredSecrets.join('\0')),
  )
  if (credentials.size > 1) return 'credentials'
  return undefined
}

/** 按 Server 名称聚合安装实例，并分别计算定义漂移和运行状态差异。 */
export function aggregateMcpServers(
  installations: McpInstallation[],
): AggregatedMcpServer[] {
  const grouped = new Map<string, McpInstallation[]>()
  for (const installation of installations) {
    const list = grouped.get(installation.definition.name) ?? []
    list.push(installation)
    grouped.set(installation.definition.name, list)
  }

  return [...grouped.entries()]
    .map(([name, items]): AggregatedMcpServer => {
      const definitionHashes = new Set(items.map((item) => item.definitionHash))
      const states = new Set(items.map((item) => `${item.enabled}:${item.authState}`))
      const conflict = definitionHashes.size > 1 ? conflictKind(items) ?? 'unknown' : undefined
      return {
        name,
        installations: items.sort((left, right) =>
          `${left.source.agent}:${left.source.surface}:${left.source.scope}`.localeCompare(
            `${right.source.agent}:${right.source.surface}:${right.source.scope}`,
          ),
        ),
        hasDefinitionDrift: definitionHashes.size > 1,
        hasStateDrift: states.size > 1,
        ...(conflict ? { conflictKind: conflict } : {}),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}
