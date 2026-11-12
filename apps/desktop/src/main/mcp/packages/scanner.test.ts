import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MCP_PACKAGE_LIMITS } from '../../../shared/mcp-packages'
import { scanMcpPackages } from './scanner'

let home: string
let globalRoot: string
let cache: string
let controller: AbortController

async function writeJson(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, JSON.stringify(value))
}

async function packageAt(directory: string, name: string, extra: Record<string, unknown> = {}): Promise<void> {
  const path = join(directory, name)
  await writeJson(join(path, 'package.json'), { name, version: '1.2.3', bin: { server: 'bin.js' }, ...extra })
  await fs.writeFile(join(path, 'bin.js'), 'throw new Error("Package code must not be executed during discovery")')
}

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-package-test-'))
  globalRoot = join(home, 'global', 'node_modules')
  cache = join(home, '.npm')
  controller = new AbortController()
})

afterEach(async () => { await fs.rm(home, { recursive: true, force: true }) })

const scan = (roots: string[] = []) => scanMcpPackages({
  home, signal: controller.signal, locations: { cache, globalRoot }, projectRoots: roots,
})

describe('MCP package discovery', () => {
  it('finds global, requested npx, and hoisted direct project packages without executing their code', async () => {
    await packageAt(globalRoot, '@demo/mcp-global')
    await packageAt(globalRoot, 'ordinary-tool', { description: 'A command line client with MCP support' })
    const cached = join(cache, '_npx', 'entry')
    await writeJson(join(cached, 'package.json'), {
      _npx: { packages: ['@demo/mcp-cache@1.2.3'] },
      dependencies: { '@demo/mcp-cache': '1.2.3', 'mcp-transitive': '1.2.3' },
    })
    await packageAt(join(cached, 'node_modules'), '@demo/mcp-cache')
    await packageAt(join(cached, 'node_modules'), 'mcp-transitive')
    const project = join(home, 'repo', 'packages', 'app')
    await writeJson(join(project, 'package.json'), { dependencies: { 'mcp-direct': '1.2.3', 'not-installed': '1.2.3' } })
    await packageAt(join(home, 'repo', 'node_modules'), 'mcp-direct')
    await packageAt(join(home, 'repo', 'node_modules'), 'mcp-unrelated')

    const result = await scan([project])
    expect(result.candidates.map((candidate) => candidate.source)).toEqual(['global', 'npx', 'project'])
    expect(result.candidates.map((candidate) => candidate.packageName)).toEqual(['@demo/mcp-global', '@demo/mcp-cache', 'mcp-direct'])
    expect(result.candidates[1]?.definition.transport).toEqual({ kind: 'stdio', command: 'npx', args: ['-y', '--package=@demo/mcp-cache@1.2.3', '--', 'server'], env: {} })
    expect(result.candidates[2]?.definition.transport).toMatchObject({ cwd: await fs.realpath(project) })
    expect(JSON.stringify(result.candidates[1]?.definition)).not.toContain('_npx')
  })

  it('supports the older npx dependency record and merges identical cached copies', async () => {
    for (const entry of ['one', 'two']) {
      const root = join(cache, '_npx', entry)
      await writeJson(join(root, 'package.json'), { dependencies: { 'mcp-server': '1.2.3' } })
      await packageAt(join(root, 'node_modules'), 'mcp-server')
    }
    expect((await scan()).candidates).toHaveLength(1)
  })

  it('uses explicit MCP metadata and keeps multiple executable choices', async () => {
    await packageAt(globalRoot, 'otherwise-ordinary', { mcpName: 'io.example/server', bin: { server: 'bin.js', setup: 'bin.js' } })
    await packageAt(globalRoot, '@modelcontextprotocol/inspector')
    await packageAt(globalRoot, 'mcp-invalid-bin', { bin: { '--bad': 'bin.js', escape: '../../outside.js' } })
    const result = await scan()
    expect(result.candidates.map((candidate) => candidate.executable).sort()).toEqual(['server', 'setup'])
    expect(result.candidates.every((candidate) => candidate.evidence === 'declared')).toBe(true)
  })

  it('continues after malformed or oversized metadata and retains valid candidates', async () => {
    await packageAt(globalRoot, 'mcp-valid')
    await packageAt(globalRoot, 'mcp-broken')
    await fs.writeFile(join(globalRoot, 'mcp-broken', 'package.json'), '{bad json')
    await packageAt(globalRoot, 'mcp-large')
    await fs.writeFile(join(globalRoot, 'mcp-large', 'package.json'), 'x'.repeat(MCP_PACKAGE_LIMITS.manifestBytes + 1))
    const result = await scan()
    expect(result.candidates.map((candidate) => candidate.packageName)).toEqual(['mcp-valid'])
    expect(result.issues.map((issue) => issue.code).sort()).toEqual(['file-too-large', 'invalid-manifest'])
  })

  it('stops at the work limit and returns partial results', async () => {
    for (let index = 0; index < 5; index++) await packageAt(globalRoot, `mcp-server-${index}`)
    const result = await scanMcpPackages({ home, signal: controller.signal, locations: { cache, globalRoot }, projectRoots: [], maxPackages: 2 })
    expect(result.scannedPackages).toBe(2)
    expect(result.candidates).toHaveLength(2)
    expect(result.limited).toBe(true)
  })

  it('aborts when cancelled instead of continuing to read package folders', async () => {
    await packageAt(globalRoot, 'mcp-first')
    await expect(scanMcpPackages({
      home, signal: controller.signal, locations: { cache, globalRoot }, projectRoots: [],
      onProgress: (snapshot) => { if (snapshot.candidates.length) controller.abort() },
    })).rejects.toThrow()
  })
})
