/**
 * @file MCP 敏感字段与名称规则。
 *
 * 单独成模块是为了让 `mcp/import.ts` 这类需要跑在渲染进程的纯逻辑不必经过
 * `validate.ts → operations.ts → codecs` 这条带 Node 内建依赖的链路。
 */

/** 参数 flag 命中即视为可能内嵌明文凭据。 */
export const SENSITIVE_MCP_ARGUMENT = /(token|secret|password|passwd|api[-_]?key|authorization)/i

/** URL 查询参数名命中即视为可能内嵌凭据。 */
export const SENSITIVE_MCP_URL_KEY = /(token|secret|password|passwd|api[-_]?key|auth|signature)/i

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 判断名称是否是合法的 MCP 环境变量名；导入解析与定义校验共用。 */
export function isValidMcpEnvName(value: string): boolean {
  return ENV_NAME.test(value)
}
