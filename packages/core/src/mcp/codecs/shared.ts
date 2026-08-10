import type { McpConfigFormat, McpConfigObject, McpConfigValue } from './types.js'
import { McpConfigCodecError } from './types.js'

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

export function isConfigObject(value: unknown): value is McpConfigObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

export function assertConfigPath(
  nodePath: readonly string[],
  name: string | undefined,
  format: McpConfigFormat,
): void {
  const segments = name === undefined ? nodePath : [...nodePath, name]
  if (
    nodePath.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 || segment.includes('\0') || UNSAFE_PATH_SEGMENTS.has(segment),
    )
  ) {
    throw new McpConfigCodecError(
      'MCP_CONFIG_PATH_INVALID',
      format,
      `invalid MCP config path: ${segments.join('.')}`,
    )
  }
}

export function requireConfigObject(
  value: unknown,
  format: McpConfigFormat,
  code: 'MCP_CONFIG_ROOT_INVALID' | 'MCP_CONFIG_NODE_INVALID',
  label: string,
): McpConfigObject {
  if (!isConfigObject(value)) {
    throw new McpConfigCodecError(code, format, `${label} must be an object`)
  }
  return value
}

export function getConfigNode(
  root: McpConfigObject,
  nodePath: readonly string[],
  format: McpConfigFormat,
): McpConfigObject | undefined {
  let current: McpConfigObject = root
  for (const segment of nodePath) {
    if (!Object.hasOwn(current, segment)) return undefined
    current = requireConfigObject(
      current[segment],
      format,
      'MCP_CONFIG_NODE_INVALID',
      `MCP config node ${nodePath.join('.')}`,
    )
  }
  return current
}

export function ensureConfigNode(
  root: McpConfigObject,
  nodePath: readonly string[],
  format: McpConfigFormat,
): McpConfigObject {
  let current: McpConfigObject = root
  for (const segment of nodePath) {
    if (!Object.hasOwn(current, segment)) current[segment] = {}
    current = requireConfigObject(
      current[segment],
      format,
      'MCP_CONFIG_NODE_INVALID',
      `MCP config node ${nodePath.join('.')}`,
    )
  }
  return current
}

export function assertConfigValue(value: McpConfigValue, format: McpConfigFormat): void {
  const visit = (entry: McpConfigValue, seen: Set<object>): void => {
    if (entry === null) {
      if (format === 'toml') {
        throw new McpConfigCodecError(
          'MCP_CONFIG_WRITE_VALIDATION_FAILED',
          format,
          'TOML config values must not contain null',
        )
      }
      return
    }
    if (typeof entry === 'string' || typeof entry === 'boolean') return
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) {
        throw new McpConfigCodecError(
          'MCP_CONFIG_WRITE_VALIDATION_FAILED',
          format,
          'MCP config numbers must be finite',
        )
      }
      return
    }

    if (seen.has(entry)) {
      throw new McpConfigCodecError(
        'MCP_CONFIG_WRITE_VALIDATION_FAILED',
        format,
        'MCP config values must not contain cycles',
      )
    }
    seen.add(entry)
    for (const child of Array.isArray(entry) ? entry : Object.values(entry)) visit(child, seen)
    seen.delete(entry)
  }

  visit(value, new Set())
}
