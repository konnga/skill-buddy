import { TomlDocument, TomlFormat } from '@decimalturn/toml-patch'
import {
  assertConfigPath,
  assertConfigValue,
  ensureConfigNode,
  getConfigNode,
  requireConfigObject,
} from './shared.js'
import type { McpConfigCodec, McpConfigObject } from './types.js'
import { McpConfigCodecError } from './types.js'

interface TomlCstTableNode {
  type?: string
  key?: {
    item?: {
      value?: string[]
    }
  }
}

function tableKey(segment: string): string {
  return /^[A-Za-z0-9_-]+$/.test(segment) ? segment : JSON.stringify(segment)
}

function hasExplicitTable(document: TomlDocument, path: readonly string[]): boolean {
  return (document.cst as unknown as TomlCstTableNode[]).some((node) => {
    if (node.type !== 'Table') return false
    const value = node.key?.item?.value
    return (
      value?.length === path.length && value.every((segment, index) => segment === path[index])
    )
  })
}

function appendExplicitTable(text: string, path: readonly string[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const separator =
    text.length === 0
      ? ''
      : text.endsWith(`${eol}${eol}`)
        ? ''
        : text.endsWith(eol)
          ? eol
          : `${eol}${eol}`
  return `${text}${separator}[${path.map(tableKey).join('.')}]${eol}`
}

/** 基于 TOML CST 补丁的格式保真编辑器，专门处理 Codex 的嵌套 MCP 表。 */
export class TomlMcpConfigCodec implements McpConfigCodec {
  readonly format = 'toml' as const

  parse(text: string): McpConfigObject {
    try {
      const document = new TomlDocument(text, { integersAsBigInt: false })
      return requireConfigObject(
        document.toJsObject,
        this.format,
        'MCP_CONFIG_ROOT_INVALID',
        'MCP config root',
      )
    } catch (error) {
      if (error instanceof McpConfigCodecError) throw error
      throw new McpConfigCodecError(
        'MCP_CONFIG_PARSE_FAILED',
        this.format,
        `TOML parse failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  readServers(text: string, nodePath: readonly string[]): McpConfigObject {
    assertConfigPath(nodePath, undefined, this.format)
    return getConfigNode(this.parse(text), nodePath, this.format) ?? {}
  }

  upsertServer(
    text: string,
    nodePath: readonly string[],
    name: string,
    value: McpConfigObject,
  ): string {
    assertConfigPath(nodePath, name, this.format)
    assertConfigValue(value, this.format)

    let source = text
    let document = this.createDocument(source)
    const root = requireConfigObject(
      document.toJsObject,
      this.format,
      'MCP_CONFIG_ROOT_INVALID',
      'MCP config root',
    )
    const existingNode = getConfigNode(root, nodePath, this.format)

    // toml-patch 不能直接向仅由子表隐式创建的父表新增兄弟项。
    // 先追加一个合法的显式父表，再让 CST 补丁生成目标子表。
    if (
      existingNode &&
      !Object.hasOwn(existingNode, name) &&
      !hasExplicitTable(document, nodePath)
    ) {
      source = appendExplicitTable(source, nodePath)
      document = this.createDocument(source)
    }

    const updatedRoot = requireConfigObject(
      document.toJsObject,
      this.format,
      'MCP_CONFIG_ROOT_INVALID',
      'MCP config root',
    )
    const servers = ensureConfigNode(updatedRoot, nodePath, this.format)
    servers[name] = value

    const format = TomlFormat.autoDetectFormat(source)
    format.inlineTableStart = nodePath.length + 2
    document.patch(updatedRoot, format)
    const output = document.toTomlString
    this.validate(output)
    return output
  }

  removeServer(text: string, nodePath: readonly string[], name: string): string {
    assertConfigPath(nodePath, name, this.format)
    const document = this.createDocument(text)
    const root = requireConfigObject(
      document.toJsObject,
      this.format,
      'MCP_CONFIG_ROOT_INVALID',
      'MCP config root',
    )
    const servers = getConfigNode(root, nodePath, this.format)
    if (!servers || !Object.hasOwn(servers, name)) return text

    const server = requireConfigObject(
      servers[name],
      this.format,
      'MCP_CONFIG_NODE_INVALID',
      `MCP server ${name}`,
    )
    for (const key of Object.keys(server)) delete server[key]
    document.patch(root, TomlFormat.autoDetectFormat(text))

    const clearedText = document.toTomlString
    const clearedRoot = requireConfigObject(
      document.toJsObject,
      this.format,
      'MCP_CONFIG_ROOT_INVALID',
      'MCP config root',
    )
    const clearedServers = getConfigNode(clearedRoot, nodePath, this.format)
    if (clearedServers) delete clearedServers[name]
    document.patch(clearedRoot, TomlFormat.autoDetectFormat(clearedText))

    const output = document.toTomlString
    this.validate(output)
    return output
  }

  validate(text: string): void {
    try {
      this.createDocument(text)
    } catch (error) {
      if (error instanceof McpConfigCodecError) {
        throw new McpConfigCodecError(
          'MCP_CONFIG_WRITE_VALIDATION_FAILED',
          this.format,
          `edited TOML config is invalid: ${error.message}`,
          { cause: error },
        )
      }
      throw error
    }
  }

  private createDocument(text: string): TomlDocument {
    try {
      return new TomlDocument(text, { integersAsBigInt: false })
    } catch (error) {
      throw new McpConfigCodecError(
        'MCP_CONFIG_PARSE_FAILED',
        this.format,
        `TOML parse failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
}

export const tomlMcpConfigCodec = new TomlMcpConfigCodec()
