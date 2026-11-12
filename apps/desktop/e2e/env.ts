/**
 * `ELECTRON_RUN_AS_NODE=1` 会让 Electron 二进制退化成纯 Node 进程，主进程里的
 * `import 'electron'` 因此拿不到 electron 内建模块，启动即抛
 * `TypeError: Cannot read properties of undefined (reading 'exports')`。
 *
 * 这个变量是终端环境里常见的残留（例如临时用 Electron 跑 node 脚本后忘了 unset），
 * 会通过 `process.env` 一路传给 Playwright 启动的 Electron。E2E 只关心应用本身，
 * 因此统一在这里剔除，避免每个 spec 各自记一遍。
 */
export function electronTestEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  // NODE_OPTIONS 里的实验性参数同样会干扰 Electron 启动，一并清理。
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  return { ...env, ...overrides }
}
