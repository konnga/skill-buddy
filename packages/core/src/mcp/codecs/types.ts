export type McpConfigFormat = 'json' | 'jsonc' | 'toml'

export type McpConfigPrimitive = string | number | boolean | null

export type McpConfigValue =
  | McpConfigPrimitive
  | McpConfigValue[]
  | { [key: string]: McpConfigValue }

export type McpConfigObject = Record<string, McpConfigValue>

export type McpConfigErrorCode =
  | 'MCP_CONFIG_PARSE_FAILED'
  | 'MCP_CONFIG_ROOT_INVALID'
  | 'MCP_CONFIG_NODE_INVALID'
  | 'MCP_CONFIG_PATH_INVALID'
  | 'MCP_CONFIG_WRITE_VALIDATION_FAILED'

/** 配置格式层可安全暴露给上层的结构化错误。 */
export class McpConfigCodecError extends Error {
  readonly code: McpConfigErrorCode
  readonly format: McpConfigFormat

  constructor(
    code: McpConfigErrorCode,
    format: McpConfigFormat,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'McpConfigCodecError'
    this.code = code
    this.format = format
  }
}

/** MCP 配置节点的格式保真读写接口。 */
export interface McpConfigCodec {
  readonly format: McpConfigFormat
  parse(text: string): McpConfigObject
  readServers(text: string, nodePath: readonly string[]): McpConfigObject
  upsertServer(
    text: string,
    nodePath: readonly string[],
    name: string,
    /** Adapter 已合并目标平台未知字段后的完整原生 Server 配置。 */
    value: McpConfigObject,
  ): string
  removeServer(text: string, nodePath: readonly string[], name: string): string
  validate(text: string): void
}
