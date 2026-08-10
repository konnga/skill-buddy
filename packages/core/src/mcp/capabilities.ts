import type { McpPlatformCapabilities, McpProtocolFeatures } from './types.js'

const BASE_PROTOCOL_FEATURES: McpProtocolFeatures = {
  tools: true,
  prompts: false,
  resources: false,
  roots: false,
  elicitation: false,
  apps: false,
}

/** 创建不可变的平台能力声明，避免各 Adapter 共享可变数组。 */
export function defineMcpCapabilities(
  input: Omit<McpPlatformCapabilities, 'management' | 'protocolFeatures'> & {
    management?: McpPlatformCapabilities['management']
    protocolFeatures?: Partial<McpProtocolFeatures>
  },
): McpPlatformCapabilities {
  return {
    ...input,
    management: input.management ?? 'read-write',
    scopes: [...input.scopes],
    transports: [...input.transports],
    configFormats: [...input.configFormats],
    protocolFeatures: {
      ...BASE_PROTOCOL_FEATURES,
      ...input.protocolFeatures,
    },
  }
}
