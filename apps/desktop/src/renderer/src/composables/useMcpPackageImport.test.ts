import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpPackageProgress, McpPackageScanResult } from '#shared/mcp-packages'
import { useMcpPackageImport } from './useMcpPackageImport'

const empty: McpPackageScanResult = { status: 'complete', candidates: [], issues: [], scannedPackages: 0, stage: 'global', limited: false }

afterEach(() => { vi.unstubAllGlobals() })

function setup() {
  let listener: (progress: McpPackageProgress) => void = () => undefined
  const unsubscribe = vi.fn()
  const api = {
    onMcpPackageProgress: vi.fn((callback: (progress: McpPackageProgress) => void) => { listener = callback; return unsubscribe }),
    scanMcpPackages: vi.fn(),
    cancelMcpPackageScan: vi.fn().mockResolvedValue(undefined),
  }
  vi.stubGlobal('window', { skillsManager: api })
  const scope = effectScope()
  const input = scope.run(() => useMcpPackageImport())!
  return { input, api, scope, unsubscribe, progress: (value: McpPackageProgress) => listener(value) }
}

describe('package import request lifecycle', () => {
  it('ignores previous request progress and prevents duplicate starts', async () => {
    const { input, api, scope, progress } = setup()
    api.scanMcpPackages.mockResolvedValueOnce(empty)
    await input.scan([])
    const firstId = api.scanMcpPackages.mock.calls[0]![0].requestId
    let complete!: (result: McpPackageScanResult) => void
    api.scanMcpPackages.mockImplementationOnce(() => new Promise((accept) => { complete = accept }))
    const pending = input.scan([])
    const secondId = api.scanMcpPackages.mock.calls[1]![0].requestId
    await input.scan([])
    expect(api.scanMcpPackages).toHaveBeenCalledTimes(2)
    progress({ ...empty, requestId: firstId, scannedPackages: 99 })
    expect(input.snapshot.value.scannedPackages).toBe(0)
    progress({ ...empty, requestId: secondId, scannedPackages: 3 })
    expect(input.snapshot.value.scannedPackages).toBe(3)
    complete(empty)
    await pending
    scope.stop()
  })

  it('unsubscribes and cancels on disposal, ignoring late completion', async () => {
    const { input, api, scope, unsubscribe, progress } = setup()
    let complete!: (result: McpPackageScanResult) => void
    api.scanMcpPackages.mockImplementationOnce(() => new Promise((accept) => { complete = accept }))
    const pending = input.scan([])
    const id = api.scanMcpPackages.mock.calls[0]![0].requestId
    scope.stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(api.cancelMcpPackageScan).toHaveBeenCalledWith(id)
    progress({ ...empty, requestId: id, scannedPackages: 99 })
    complete({ ...empty, scannedPackages: 99 })
    await pending
    expect(input.snapshot.value.scannedPackages).toBe(0)
  })

  it('turns IPC failures into an error state and allows retry', async () => {
    const { input, api, scope } = setup()
    api.scanMcpPackages.mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValueOnce(empty)
    await input.scan([])
    expect(input.status.value).toBe('failed')
    expect(input.busy.value).toBe(false)
    await input.scan([])
    expect(input.status.value).toBe('complete')
    scope.stop()
  })
})
