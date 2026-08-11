import {
  validateMcpDefinition,
  type McpServerDefinition,
  type McpValueRef,
} from '@skillbuddy/core'

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertOnlyKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown) throw new Error(`${label} contains unsupported field ${unknown}`)
}

function references(value: unknown, label: string): Record<string, McpValueRef> {
  const entries = record(value ?? {}, label)
  return Object.fromEntries(
    Object.entries(entries).map(([key, raw]) => {
      const ref = record(raw, `${label}.${key}`)
      if (ref.kind === 'literal') throw new Error(`${label}.${key} cannot contain a literal secret`)
      if (ref.kind === 'env') {
        assertOnlyKeys(ref, ['kind', 'name'], `${label}.${key}`)
        if (typeof ref.name !== 'string' || !ENV_NAME_RE.test(ref.name)) {
          throw new Error(`${label}.${key} has an invalid environment variable name`)
        }
        return [key, { kind: 'env' as const, name: ref.name }]
      }
      if (ref.kind === 'secret') {
        assertOnlyKeys(ref, ['kind', 'key', 'state'], `${label}.${key}`)
        if (typeof ref.key !== 'string' || !ENV_NAME_RE.test(ref.key)) {
          throw new Error(`${label}.${key} has an invalid secret key`)
        }
        return [key, { kind: 'secret' as const, key: ref.key, state: 'unknown' as const }]
      }
      throw new Error(`${label}.${key} must be an env or secret reference`)
    }),
  )
}

function referenceName(ref: McpValueRef): string {
  if (ref.kind === 'env') return ref.name
  if (ref.kind === 'secret') return ref.key
  throw new Error('literal references are not allowed')
}

/** Registry MCP 定义白名单；返回值不含明文密钥、本机认证状态或平台 metadata。 */
export function sanitizeMcpDefinition(
  value: unknown,
  expectedName: string,
): McpServerDefinition {
  const definition = record(value, 'definition')
  assertOnlyKeys(definition, ['name', 'description', 'transport', 'requiredSecrets'], 'definition')
  if (definition.name !== expectedName || !NAME_RE.test(expectedName)) {
    throw new Error('definition name must match the URL name')
  }
  if (definition.description !== undefined && typeof definition.description !== 'string') {
    throw new Error('definition description must be a string')
  }
  if (
    !Array.isArray(definition.requiredSecrets) ||
    definition.requiredSecrets.some(
      (secret) => typeof secret !== 'string' || !ENV_NAME_RE.test(secret),
    )
  ) {
    throw new Error('requiredSecrets must contain environment variable names only')
  }

  const transport = record(definition.transport, 'definition.transport')
  if (transport.kind === 'stdio') {
    assertOnlyKeys(transport, ['kind', 'command', 'args', 'cwd', 'env'], 'definition.transport')
    if (typeof transport.command !== 'string' || !transport.command.trim()) {
      throw new Error('stdio command is required')
    }
    if (!Array.isArray(transport.args) || transport.args.some((arg) => typeof arg !== 'string')) {
      throw new Error('stdio args must be strings')
    }
    if (transport.cwd !== undefined && typeof transport.cwd !== 'string') {
      throw new Error('stdio cwd must be a string')
    }
    const env = references(transport.env, 'definition.transport.env')
    const requiredSecrets = new Set([
      ...(definition.requiredSecrets as string[]),
      ...Object.values(env).map(referenceName),
    ])
    const sanitized: McpServerDefinition = {
      name: expectedName,
      ...(definition.description ? { description: definition.description as string } : {}),
      transport: {
        kind: 'stdio',
        command: transport.command,
        args: [...(transport.args as string[])],
        ...(transport.cwd ? { cwd: transport.cwd as string } : {}),
        env,
      },
      requiredSecrets: [...requiredSecrets].sort(),
    }
    validateMcpDefinition(sanitized, { source: 'user-input' })
    return sanitized
  }

  if (!['streamable-http', 'sse', 'websocket'].includes(String(transport.kind))) {
    throw new Error('unsupported MCP transport')
  }
  assertOnlyKeys(transport, ['kind', 'url', 'headers'], 'definition.transport')
  if (typeof transport.url !== 'string') throw new Error('remote URL is required')
  let url: URL
  try {
    url = new URL(transport.url)
  } catch {
    throw new Error('remote URL is invalid')
  }
  const headers = references(transport.headers, 'definition.transport.headers')
  const requiredSecrets = new Set([
    ...(definition.requiredSecrets as string[]),
    ...Object.values(headers).map(referenceName),
  ])
  const sanitized: McpServerDefinition = {
    name: expectedName,
    ...(definition.description ? { description: definition.description as string } : {}),
    transport: {
      kind: transport.kind as 'streamable-http' | 'sse' | 'websocket',
      url: url.toString(),
      headers,
    },
    requiredSecrets: [...requiredSecrets].sort(),
  }
  validateMcpDefinition(sanitized, { source: 'user-input' })
  return sanitized
}
