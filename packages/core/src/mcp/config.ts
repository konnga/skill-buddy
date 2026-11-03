/**
 * @file 渲染进程可用的 MCP 配置解析入口。
 *
 * 这里只导出不依赖 Node 内建模块的纯逻辑（`patterns` + `import`），
 * 避免 `@skillbuddy/core` 主入口经 `operations → codecs` 把 `node:util`
 * 等模块带进浏览器构建。
 */
export * from './import.js'
export * from './patterns.js'
