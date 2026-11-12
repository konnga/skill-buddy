import { app, utilityProcess, type UtilityProcess, type WebContents } from 'electron'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { validateMcpDefinition, type McpServerDefinition } from '@skillbuddy/core'
import {
  MCP_PACKAGE_LIMITS as limits,
  type McpPackageCandidate,
  type McpPackageScanRequest,
  type McpPackageScanResult,
  type McpPackageScanStatus,
  type McpPackageSnapshot,
} from '../../../shared/mcp-packages'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function oneOf(value: unknown, choices: readonly string[]): value is string {
  return typeof value === 'string' && choices.includes(value)
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value)
}

/** 子进程消息只允许有限数量的元数据，重新构造定义后交给已有校验器。 */
function snapshot(value: unknown): McpPackageSnapshot | null {
  if (!record(value) || !Array.isArray(value.candidates) || value.candidates.length > limits.candidates ||
    !Array.isArray(value.issues) || value.issues.length > limits.issues ||
    !Number.isInteger(value.scannedPackages) || Number(value.scannedPackages) < 0 || Number(value.scannedPackages) > limits.packages ||
    !oneOf(value.stage, ['global', 'npx', 'project']) || typeof value.limited !== 'boolean') return null
  const candidates: McpPackageCandidate[] = []
  for (const raw of value.candidates) {
    if (!record(raw) || !boundedString(raw.id, 24) || !/^[a-f0-9]{24}$/.test(raw.id) ||
      !boundedString(raw.packageName, 214) || !boundedString(raw.version, 128) || !boundedString(raw.executable, 128) ||
      !boundedString(raw.location, 4096) || !oneOf(raw.source, ['global', 'npx', 'project']) ||
      !oneOf(raw.evidence, ['declared', 'inferred']) ||
      (raw.projectRoot !== undefined && (!boundedString(raw.projectRoot, 4096) || !isAbsolute(raw.projectRoot))) ||
      !record(raw.definition) || !record(raw.definition.transport)) return null
    const transport = raw.definition.transport
    const args = ['-y', `--package=${raw.packageName}@${raw.version}`, '--', raw.executable]
    if (!Array.isArray(transport.args) || transport.args.length !== args.length ||
      transport.args.some((argument, index) => argument !== args[index]) ||
      transport.command !== 'npx' || transport.kind !== 'stdio' ||
      !boundedString(raw.definition.name, 128)) return null
    const definition: McpServerDefinition = {
      name: raw.definition.name,
      transport: {
        kind: 'stdio', command: 'npx', args,
        ...(raw.source === 'project' && typeof raw.projectRoot === 'string' ? { cwd: raw.projectRoot } : {}), env: {},
      },
      requiredSecrets: [],
    }
    try { validateMcpDefinition(definition) } catch { return null }
    candidates.push({
      id: raw.id, packageName: raw.packageName, version: raw.version, executable: raw.executable,
      location: raw.location, source: raw.source as McpPackageCandidate['source'],
      evidence: raw.evidence as McpPackageCandidate['evidence'],
      ...(typeof raw.projectRoot === 'string' ? { projectRoot: raw.projectRoot } : {}), definition,
    })
  }
  const issues: McpPackageSnapshot['issues'] = []
  for (const raw of value.issues) {
    if (!record(raw) || !oneOf(raw.code, ['npm-unavailable', 'npm-query-failed', 'read-failed', 'invalid-manifest', 'file-too-large']) ||
      (raw.path !== undefined && !boundedString(raw.path, 4096))) return null
    issues.push({ code: raw.code as McpPackageSnapshot['issues'][number]['code'], ...(typeof raw.path === 'string' ? { path: raw.path } : {}) })
  }
  return { candidates, issues, scannedPackages: Number(value.scannedPackages), stage: value.stage as McpPackageSnapshot['stage'], limited: value.limited }
}

interface DiscoveryOptions {
  spawn?: () => UtilityProcess
  timeoutMs?: number
}

interface ActiveScan {
  requestId: string
  ownerId: number
  finish: (status: McpPackageScanStatus) => void
}

/** 每次只启动一个隔离扫描进程；异常、超时及窗口关闭均收敛为可恢复结果。 */
export class McpPackageDiscovery {
  #active: ActiveScan | null = null

  constructor(private readonly options: DiscoveryOptions = {}) {}

  scan(request: McpPackageScanRequest, owner: WebContents): Promise<McpPackageScanResult> {
    if (this.#active) return Promise.reject(new Error('MCP_PACKAGE_SCAN_BUSY'))
    if (!request || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(request.requestId) ||
      !Array.isArray(request.projectRoots) || request.projectRoots.length > 64 ||
      request.projectRoots.some((root) => !boundedString(root, 4096) || !isAbsolute(root))) {
      return Promise.reject(new Error('MCP_PACKAGE_SCAN_INVALID'))
    }
    const home = resolve(homedir())
    const roots = [...new Set(request.projectRoots.map((root) => resolve(root)))].filter((root) => root !== home && dirname(root) !== root)
    return new Promise((accept) => {
      let child: UtilityProcess | undefined
      let timer: ReturnType<typeof setTimeout> | undefined
      let completed = false
      let latest: McpPackageSnapshot = { candidates: [], issues: [], scannedPackages: 0, stage: 'global', limited: false }
      const onDestroyed = () => finish('cancelled')
      const finish = (status: McpPackageScanStatus) => {
        if (completed) return
        completed = true
        if (timer) clearTimeout(timer)
        owner.removeListener('destroyed', onDestroyed)
        if (child) {
          child.removeAllListeners()
          /** kill 之后仍可能收到错误事件，必须保留处理器。 */
          child.on('error', () => undefined)
          const terminate = () => {
            try { child?.kill() } catch { /** 已退出的子进程不影响主进程。 */ }
          }
          if (child.pid === undefined) child.once('spawn', terminate)
          terminate()
        }
        if (this.#active?.requestId === request.requestId) this.#active = null
        accept({ ...latest, status })
      }
      if (owner.isDestroyed()) { finish('cancelled'); return }
      this.#active = { requestId: request.requestId, ownerId: owner.id, finish }
      try {
        child = this.options.spawn?.() ?? utilityProcess.fork(join(app.getAppPath(), 'out', 'main', 'mcp-package-worker.js'), [], {
          stdio: 'pipe', serviceName: 'MCP package discovery', execArgv: ['--max-old-space-size=128'],
        })
        child.on('error', () => finish('failed'))
        child.on('exit', () => finish('failed'))
        for (const stream of [child.stdout, child.stderr]) {
          stream?.on('error', () => undefined)
          stream?.resume()
        }
        child.on('message', (message: unknown) => {
          if (completed) return
          try {
            if (!record(message) || !oneOf(message.type, ['progress', 'result']) ||
              Buffer.byteLength(JSON.stringify(message), 'utf8') > limits.messageBytes) { finish('failed'); return }
            const next = snapshot(message.snapshot)
            if (!next) { finish('failed'); return }
            latest = next
            if (!owner.isDestroyed()) owner.send('mcp:packages-progress', { ...latest, requestId: request.requestId })
            if (message.type === 'result') finish('complete')
          } catch { finish(owner.isDestroyed() ? 'cancelled' : 'failed') }
        })
        child.once('spawn', () => {
          if (!completed) {
            try { child?.postMessage({ projectRoots: roots }) } catch { finish('failed') }
          }
        })
        owner.once('destroyed', onDestroyed)
        timer = setTimeout(() => finish('timed-out'), this.options.timeoutMs ?? limits.scanTimeoutMs)
      } catch { finish('failed') }
    })
  }

  cancel(requestId: string, ownerId: number): void {
    if (this.#active?.requestId === requestId && this.#active.ownerId === ownerId) this.#active.finish('cancelled')
  }

  dispose(): void {
    this.#active?.finish('cancelled')
  }
}
