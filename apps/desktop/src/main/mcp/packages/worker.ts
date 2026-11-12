import { scanMcpPackages } from './scanner'
import { MCP_PACKAGE_LIMITS } from '../../../shared/mcp-packages'

const controller = new AbortController()
let started = false

/** 主进程关闭或通信失败时，后台任务也不会无限存活。 */
setTimeout(() => {
  controller.abort()
  process.exit(0)
}, MCP_PACKAGE_LIMITS.scanTimeoutMs + 1000)

/** 主进程终止任务时，同时取消 npm 路径查询子进程。 */
process.once('SIGTERM', () => {
  controller.abort()
  process.exit(0)
})

process.parentPort.on('message', (event) => {
  if (started) return
  started = true
  const input: unknown = event.data
  if (typeof input !== 'object' || input === null || !('projectRoots' in input) ||
    !Array.isArray(input.projectRoots) || input.projectRoots.some((root) => typeof root !== 'string')) {
    process.parentPort.postMessage({ type: 'failed' })
    return
  }
  void scanMcpPackages({
    projectRoots: input.projectRoots, signal: controller.signal,
    onProgress: (snapshot) => process.parentPort.postMessage({ type: 'progress', snapshot }),
  }).then((snapshot) => {
    process.parentPort.postMessage({ type: 'result', snapshot })
  }).catch(() => {
    process.parentPort.postMessage({ type: 'failed' })
  })
})
