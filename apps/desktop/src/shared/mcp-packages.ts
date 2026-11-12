import type { McpServerDefinition } from '@skillbuddy/core'

export type McpPackageSource = 'global' | 'npx' | 'project'
export type McpPackageScanStatus = 'complete' | 'cancelled' | 'timed-out' | 'failed'
export type McpPackageIssueCode =
  | 'npm-unavailable'
  | 'npm-query-failed'
  | 'read-failed'
  | 'invalid-manifest'
  | 'file-too-large'

export interface McpPackageCandidate {
  id: string
  packageName: string
  version: string
  executable: string
  source: McpPackageSource
  location: string
  projectRoot?: string
  evidence: 'declared' | 'inferred'
  definition: McpServerDefinition
}

export interface McpPackageIssue {
  code: McpPackageIssueCode
  path?: string
}

export interface McpPackageSnapshot {
  candidates: McpPackageCandidate[]
  issues: McpPackageIssue[]
  scannedPackages: number
  stage: McpPackageSource
  limited: boolean
}

export interface McpPackageScanResult extends McpPackageSnapshot {
  status: McpPackageScanStatus
}

export interface McpPackageScanRequest {
  requestId: string
  projectRoots: string[]
}

export interface McpPackageProgress extends McpPackageSnapshot {
  requestId: string
}

/** 限制单轮工作量、消息体和后台存活时间，包目录不进入常驻扫描。 */
export const MCP_PACKAGE_LIMITS = {
  projects: 32,
  packages: 1000,
  cacheEntries: 128,
  directoryEntries: 4000,
  candidates: 100,
  issues: 20,
  manifestBytes: 128 * 1024,
  messageBytes: 512 * 1024,
  scanTimeoutMs: 20_000,
  npmTimeoutMs: 3000,
} as const
