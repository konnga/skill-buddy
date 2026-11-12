import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UtilityProcess, WebContents } from 'electron'
import type { McpPackageCandidate, McpPackageSnapshot } from '../../../shared/mcp-packages'

vi.mock('electron', () => ({ app: { getAppPath: () => '/app' }, utilityProcess: { fork: vi.fn() } }))
import { McpPackageDiscovery } from './discovery'

class Child extends EventEmitter {
  pid: number | undefined = undefined
  stdout = null
  stderr = null
  kill = vi.fn(() => true)
  postMessage = vi.fn()
}

function owner() {
  return Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false, send: vi.fn() })
}

const candidate: McpPackageCandidate = {
  id: 'a'.repeat(24), packageName: 'mcp-demo', version: '1.2.3', executable: 'server',
  source: 'global', location: '/npm/mcp-demo', evidence: 'inferred',
  definition: { name: 'demo', transport: { kind: 'stdio', command: 'npx', args: ['-y', '--package=mcp-demo@1.2.3', '--', 'server'], env: {} }, requiredSecrets: [] },
}
const snapshot: McpPackageSnapshot = { candidates: [candidate], issues: [], scannedPackages: 1, stage: 'global', limited: false }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function setup(timeoutMs = 20_000) {
  const child = new Child()
  const sender = owner()
  const discovery = new McpPackageDiscovery({ spawn: () => child as unknown as UtilityProcess, timeoutMs })
  const pending = discovery.scan({ requestId: 'scan-1', projectRoots: [] }, sender as unknown as WebContents)
  child.pid = 42
  child.emit('spawn')
  return { child, sender, discovery, pending }
}

describe('isolated MCP package task', () => {
  it('returns candidates and releases the child and window listeners after completion', async () => {
    const { child, sender, pending } = setup()
    expect(child.postMessage).toHaveBeenCalledWith({ projectRoots: [] })
    child.emit('message', { type: 'progress', snapshot })
    child.emit('message', { type: 'result', snapshot })
    expect((await pending).status).toBe('complete')
    expect(sender.send).toHaveBeenCalledWith('mcp:packages-progress', { ...snapshot, requestId: 'scan-1' })
    expect(child.kill).toHaveBeenCalledOnce()
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it.each(['exit', 'error'])('contains a child %s and retains partial results', async (event) => {
    const { child, pending } = setup()
    child.emit('message', { type: 'progress', snapshot })
    expect(() => child.emit(event, new Error('child failure'))).not.toThrow()
    const result = await pending
    expect(result.status).toBe('failed')
    expect(result.candidates).toHaveLength(1)
    expect(() => child.emit('error', new Error('late child failure'))).not.toThrow()
  })

  it('times out and stops the process without rejecting the IPC request', async () => {
    const { child, pending } = setup(50)
    child.emit('message', { type: 'progress', snapshot })
    await vi.advanceTimersByTimeAsync(50)
    expect(await pending).toMatchObject({ status: 'timed-out', candidates: [candidate] })
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('binds cancellation to the requesting window and disposes when the window closes', async () => {
    const { child, sender, discovery, pending } = setup()
    discovery.cancel('scan-1', 2)
    expect(child.kill).not.toHaveBeenCalled()
    sender.emit('destroyed')
    expect((await pending).status).toBe('cancelled')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('does not start a second scan while a task is active', async () => {
    const { discovery, sender, pending } = setup()
    await expect(discovery.scan({ requestId: 'scan-2', projectRoots: [] }, sender as unknown as WebContents)).rejects.toThrow('MCP_PACKAGE_SCAN_BUSY')
    discovery.cancel('scan-1', sender.id)
    expect((await pending).status).toBe('cancelled')
  })

  it('recovers from invalid or oversized worker messages', async () => {
    const { child, pending } = setup()
    child.emit('message', { type: 'result', snapshot: { ...snapshot, candidates: Array(101).fill(candidate) } })
    expect((await pending).status).toBe('failed')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('terminates a process that finishes spawning after cancellation', async () => {
    const child = new Child()
    const sender = owner()
    const discovery = new McpPackageDiscovery({ spawn: () => child as unknown as UtilityProcess })
    const pending = discovery.scan({ requestId: 'scan-1', projectRoots: [] }, sender as unknown as WebContents)
    discovery.cancel('scan-1', sender.id)
    expect((await pending).status).toBe('cancelled')
    child.pid = 42
    child.emit('spawn')
    expect(child.kill).toHaveBeenCalledTimes(2)
    expect(child.postMessage).not.toHaveBeenCalled()
  })

  it.each(['oversized', 'cyclic'])('contains a %s message without throwing in the main process', async (kind) => {
    const { child, pending } = setup()
    const message: Record<string, unknown> = { type: 'result', snapshot }
    if (kind === 'oversized') message.extra = 'x'.repeat(600 * 1024)
    else message.extra = message
    expect(() => child.emit('message', message)).not.toThrow()
    expect((await pending).status).toBe('failed')
  })

  it('starts a fresh task after cancellation and ignores the previous child', async () => {
    const first = new Child()
    const second = new Child()
    const sender = owner()
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const discovery = new McpPackageDiscovery({ spawn })
    const previous = discovery.scan({ requestId: 'scan-1', projectRoots: [] }, sender as unknown as WebContents)
    first.pid = 42
    first.emit('spawn')
    discovery.cancel('scan-1', sender.id)
    await previous
    const current = discovery.scan({ requestId: 'scan-2', projectRoots: [] }, sender as unknown as WebContents)
    second.pid = 43
    second.emit('spawn')
    first.emit('message', { type: 'result', snapshot })
    discovery.cancel('scan-1', sender.id)
    expect(second.kill).not.toHaveBeenCalled()
    second.emit('message', { type: 'result', snapshot: { ...snapshot, candidates: [], scannedPackages: 0 } })
    expect(await current).toMatchObject({ status: 'complete', candidates: [] })
  })

  it('catches process launch failures as a result that can be retried', async () => {
    const discovery = new McpPackageDiscovery({ spawn: () => { throw new Error('cannot spawn') } })
    expect((await discovery.scan({ requestId: 'scan-1', projectRoots: [] }, owner() as unknown as WebContents)).status).toBe('failed')
    expect((await discovery.scan({ requestId: 'scan-2', projectRoots: [] }, owner() as unknown as WebContents)).status).toBe('failed')
  })
})
