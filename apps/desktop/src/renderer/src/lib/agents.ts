import type { PlatformStatus } from '@skills-manager/core'

let platformNames = new Map<string, string>()

export function setPlatformNames(platforms: PlatformStatus[]): void {
  platformNames = new Map(platforms.map((p) => [p.id, p.displayName]))
}

export function agentLabel(agentId: string): string {
  return platformNames.get(agentId) ?? agentId
}
