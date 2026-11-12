import { computed, onScopeDispose, shallowRef } from 'vue'
import type { McpPackageScanStatus, McpPackageSnapshot } from '#shared/mcp-packages'

/** 将进度与当前请求绑定；取消、卸载和旧请求回包都不会更新下一轮扫描。 */
export function useMcpPackageImport() {
  const snapshot = shallowRef<McpPackageSnapshot>({ candidates: [], issues: [], scannedPackages: 0, stage: 'global', limited: false })
  const status = shallowRef<McpPackageScanStatus | 'idle' | 'scanning'>('idle')
  const error = shallowRef('')
  const busy = computed(() => status.value === 'scanning')
  let requestId = ''
  let disposed = false
  const unsubscribe = window.skillsManager.onMcpPackageProgress((progress) => {
    if (!disposed && progress.requestId === requestId) snapshot.value = progress
  })

  async function scan(projectRoots: string[]): Promise<void> {
    if (busy.value || disposed) return
    const id = crypto.randomUUID()
    requestId = id
    error.value = ''
    snapshot.value = { candidates: [], issues: [], scannedPackages: 0, stage: 'global', limited: false }
    status.value = 'scanning'
    try {
      const result = await window.skillsManager.scanMcpPackages({ requestId: id, projectRoots: projectRoots.slice(0, 64) })
      if (disposed || id !== requestId) return
      snapshot.value = result
      status.value = result.status
    } catch (failure) {
      if (disposed || id !== requestId) return
      status.value = 'failed'
      error.value = failure instanceof Error && failure.message.includes('MCP_PACKAGE_SCAN_BUSY') ? 'busy' : 'failed'
    }
  }

  async function cancel(): Promise<void> {
    if (requestId && busy.value) {
      try { await window.skillsManager.cancelMcpPackageScan(requestId) } catch { /** IPC 断开由扫描请求统一呈现。 */ }
    }
  }

  onScopeDispose(() => {
    disposed = true
    unsubscribe()
    void cancel()
    requestId = ''
  })
  return { snapshot, status, error, busy, scan, cancel }
}
