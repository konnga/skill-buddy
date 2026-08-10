import type { AgentId } from '../types.js'
import type { McpConfigFormat } from './codecs/index.js'

export type McpScope = 'user' | 'project' | 'local'

export type McpSourceOrigin =
  | 'user'
  | 'project'
  | 'local'
  | 'plugin'
  | 'connector'
  | 'marketplace'
  | 'admin'
  | 'system'
  | 'cloud'

export type McpTransportKind = 'stdio' | 'streamable-http' | 'sse' | 'websocket'

export type McpSecretState = 'configured' | 'missing' | 'unknown'

export type McpValueRef =
  | { kind: 'literal'; value: string }
  | { kind: 'env'; name: string }
  | { kind: 'secret'; key: string; state: McpSecretState }

export interface McpStdioTransport {
  kind: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env: Record<string, McpValueRef>
}

export interface McpRemoteTransport {
  kind: 'streamable-http' | 'sse' | 'websocket'
  url: string
  headers: Record<string, McpValueRef>
}

export interface McpServerDefinition {
  name: string
  description?: string
  transport: McpStdioTransport | McpRemoteTransport
  requiredSecrets: string[]
  metadata?: Record<string, unknown>
}

export interface McpConfigSource {
  id: string
  agent: AgentId
  surface: string
  scope: McpScope
  projectRoot?: string
  configPath: string
  format: McpConfigFormat
  nodePath: string[]
  origin: McpSourceOrigin
  readOnly: boolean
  exists: boolean
}

export type McpAuthState = 'ready' | 'missing-secrets' | 'requires-oauth' | 'unknown'

export interface McpInstallation {
  id: string
  definition: McpServerDefinition
  source: McpConfigSource
  enabled: boolean | null
  authState: McpAuthState
  definitionHash: string
  sourceHash: string
  modifiedAt?: number
  platformMetadata?: Record<string, unknown>
}

export interface McpProtocolFeatures {
  tools: boolean
  prompts: boolean
  resources: boolean
  roots: boolean
  elicitation: boolean
  apps: boolean
}

export interface McpPlatformCapabilities {
  management: 'read-write' | 'read-only'
  scopes: McpScope[]
  transports: McpTransportKind[]
  configFormats: McpConfigFormat[]
  supportsOAuth: boolean
  supportsEnvReferences: boolean
  supportsHeaderReferences: boolean
  toggle: 'native' | 'unsupported'
  protocolFeatures: McpProtocolFeatures
}

export interface McpPlatformStatus {
  agent: AgentId
  surface: string
  displayName: string
  detected: boolean
  capabilities: McpPlatformCapabilities
}

export type McpConflictKind =
  | 'transport'
  | 'endpoint'
  | 'command'
  | 'credentials'
  | 'unknown'

export interface AggregatedMcpServer {
  name: string
  installations: McpInstallation[]
  hasDefinitionDrift: boolean
  hasStateDrift: boolean
  conflictKind?: McpConflictKind
}

export interface McpScanError {
  agent: AgentId
  surface: string
  sourceId?: string
  code: string
  message: string
}

export interface McpScanResult {
  servers: AggregatedMcpServer[]
  installations: McpInstallation[]
  platforms: McpPlatformStatus[]
  errors: McpScanError[]
}
