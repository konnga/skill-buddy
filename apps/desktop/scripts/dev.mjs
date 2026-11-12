import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const env = { ...process.env }
delete env.NODE_OPTIONS

/**
 * `ELECTRON_RUN_AS_NODE=1` 会让 Electron 二进制退化成纯 Node 进程：主进程里的
 * `import 'electron'` 因此拿不到 electron 内建模块，启动即抛
 * `TypeError: Cannot read properties of undefined (reading 'exports')`
 * （栈顶是 `cjsPreparseModuleExports`，最后打印的 Node 版本是 Electron 内置的那份）。
 *
 * 这个变量常因为终端宿主是 Electron 应用、或临时用 Electron 跑 node 脚本而残留，
 * 并会在 `pnpm dev` 时一路传给 Electron。dev 流程只需要应用本身，所以在这里统一剔除，
 * 并显式提示一次，避免下次又当成代码问题排查。
 */
if (env.ELECTRON_RUN_AS_NODE !== undefined) {
  console.warn(
    '[dev] 已忽略残留的 ELECTRON_RUN_AS_NODE 环境变量：它会让 Electron 以纯 Node 模式启动并立即崩溃。',
  )
  delete env.ELECTRON_RUN_AS_NODE
}

/**
 * 直接 `node scripts/dev.mjs` 时 PATH 里没有 node_modules/.bin，裸命令名会 ENOENT。
 * 优先用仓库内的可执行文件，找不到再回退到 PATH 查找（pnpm dev 会注入 PATH）。
 */
function resolveElectronVite() {
  const name = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
  const local = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', name)
  return existsSync(local) ? local : name
}

const child = spawn(resolveElectronVite(), ['dev', '--watch'], {
  env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
