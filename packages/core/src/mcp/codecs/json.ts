import { isDeepStrictEqual } from 'node:util'
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type FormattingOptions,
  type ParseError,
  type ParseOptions,
} from 'jsonc-parser'
import {
  assertConfigPath,
  assertConfigValue,
  getConfigNode,
  isConfigObject,
  requireConfigObject,
} from './shared.js'
import type {
  McpConfigCodec,
  McpConfigFormat,
  McpConfigObject,
  McpConfigValue,
} from './types.js'
import { McpConfigCodecError } from './types.js'

function formattingOptions(text: string): FormattingOptions {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  // 只匹配行内空白：\s 会吞掉空行的换行符（及 CR），导致 tabSize 被算大并重排未修改的行。
  const indentation = text.match(/^([ \t]+)["}]/m)?.[1] ?? '  '
  return {
    eol,
    insertSpaces: !indentation.includes('\t'),
    tabSize: indentation.includes('\t') ? 1 : Math.max(1, indentation.length),
    insertFinalNewline: text.endsWith('\n'),
  }
}

function applyModification(
  text: string,
  path: string[],
  value: McpConfigValue | undefined,
  options: FormattingOptions,
): string {
  return applyEdits(text, modify(text, path, value, { formattingOptions: options }))
}

function patchJsonValue(
  text: string,
  path: string[],
  current: McpConfigValue | undefined,
  updated: McpConfigValue,
  options: FormattingOptions,
): string {
  if (!isConfigObject(current) || !isConfigObject(updated)) {
    return isDeepStrictEqual(current, updated)
      ? text
      : applyModification(text, path, updated, options)
  }

  let output = text
  for (const key of Object.keys(current)) {
    if (!Object.hasOwn(updated, key)) {
      output = applyModification(output, [...path, key], undefined, options)
    }
  }
  for (const [key, value] of Object.entries(updated)) {
    output = patchJsonValue(output, [...path, key], current[key], value, options)
  }
  return output
}

/** 使用 jsonc-parser 的最小文本编辑，保留注释和未修改区域。 */
export class JsonMcpConfigCodec implements McpConfigCodec {
  readonly format: McpConfigFormat
  readonly #parseOptions: ParseOptions

  constructor(format: 'json' | 'jsonc') {
    this.format = format
    this.#parseOptions = {
      allowEmptyContent: true,
      allowTrailingComma: format === 'jsonc',
      disallowComments: format === 'json',
    }
  }

  parse(text: string): McpConfigObject {
    if (text.trim().length === 0) return {}

    const errors: ParseError[] = []
    const value = parse(text, errors, this.#parseOptions) as unknown
    if (errors.length > 0) {
      const first = errors[0]!
      throw new McpConfigCodecError(
        'MCP_CONFIG_PARSE_FAILED',
        this.format,
        `${this.format.toUpperCase()} parse failed at offset ${first.offset}: ${printParseErrorCode(first.error)}`,
      )
    }
    return requireConfigObject(
      value,
      this.format,
      'MCP_CONFIG_ROOT_INVALID',
      'MCP config root',
    )
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
    const root = this.parse(text)

    const source = text.trim().length === 0 ? '{}' : text
    const servers = getConfigNode(root, nodePath, this.format)
    const current = servers?.[name]
    const output = patchJsonValue(
      source,
      [...nodePath, name],
      current,
      value,
      formattingOptions(text),
    )
    this.validate(output)
    return output
  }

  removeServer(text: string, nodePath: readonly string[], name: string): string {
    assertConfigPath(nodePath, name, this.format)
    const servers = this.readServers(text, nodePath)
    if (!Object.hasOwn(servers, name)) return text

    const output = applyModification(
      text,
      [...nodePath, name],
      undefined,
      formattingOptions(text),
    )
    this.validate(output)
    return output
  }

  validate(text: string): void {
    try {
      this.parse(text)
    } catch (error) {
      if (error instanceof McpConfigCodecError) {
        throw new McpConfigCodecError(
          'MCP_CONFIG_WRITE_VALIDATION_FAILED',
          this.format,
          `edited ${this.format.toUpperCase()} config is invalid: ${error.message}`,
          { cause: error },
        )
      }
      throw error
    }
  }
}

export const jsonMcpConfigCodec = new JsonMcpConfigCodec('json')
export const jsoncMcpConfigCodec = new JsonMcpConfigCodec('jsonc')
