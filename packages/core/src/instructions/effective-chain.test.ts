import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveEffectiveInstructionChain } from './effective-chain.js'
import { findInstructionProfile } from './profiles.js'
import { scanInstructionDocuments } from './scanner.js'

const cleanup: string[] = []

async function createProject(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-effective-'))
  cleanup.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

describe('effective instruction chains', () => {
  it('merges project instructions from root to target and keeps global optional', async () => {
    const root = await createProject()
    const nested = join(root, 'src')
    await fs.mkdir(nested)
    await fs.writeFile(join(root, 'AGENTS.md'), 'root\n', 'utf8')
    await fs.writeFile(join(nested, 'AGENTS.md'), 'nested\n', 'utf8')
    const scan = await scanInstructionDocuments([root], { includeGlobal: false })
    const realRoot = await fs.realpath(root)
    const realNested = await fs.realpath(nested)
    const profile = findInstructionProfile({ vendorId: 'openai', productId: 'codex', surfaceId: 'cli' })
    if (!profile) throw new Error('missing codex profile')

    const chain = deriveEffectiveInstructionChain(profile.key, realRoot, realNested, scan.documents)
    expect(chain.documents.map((item) => item.path)).toEqual([
      join(realRoot, 'AGENTS.md'),
      join(realNested, 'AGENTS.md'),
    ])
    expect(chain.includesGlobal).toBe(false)
  })

  it('merges Antigravity standalone rules and its rule directory into one level', async () => {
    const root = await createProject()
    const nested = join(root, 'src')
    await fs.mkdir(join(root, '.agents', 'rules'), { recursive: true })
    await fs.mkdir(nested)
    await fs.writeFile(join(root, 'GEMINI.md'), 'gemini\n', 'utf8')
    await fs.writeFile(join(root, 'AGENTS.md'), 'shared\n', 'utf8')
    await fs.writeFile(join(root, '.agents', 'rules', 'code-style.md'), 'style\n', 'utf8')
    const scan = await scanInstructionDocuments([root], { includeGlobal: false })
    const realRoot = await fs.realpath(root)
    const realNested = await fs.realpath(nested)

    const chain = deriveEffectiveInstructionChain(
      { vendorId: 'google', productId: 'google-antigravity', surfaceId: 'ide' },
      realRoot,
      realNested,
      scan.documents,
    )

    expect(chain.documents.map((item) => item.fileName)).toEqual([
      'GEMINI.md',
      'AGENTS.md',
      'code-style.md',
    ])
  })

  it('uses the nearest matching file for OpenCode fallback traversal', async () => {
    const root = await createProject()
    const nested = join(root, 'packages', 'app')
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(join(root, 'AGENTS.md'), 'root\n', 'utf8')
    await fs.writeFile(join(nested, 'CLAUDE.md'), 'app\n', 'utf8')
    const scan = await scanInstructionDocuments([root], { includeGlobal: false })
    const realRoot = await fs.realpath(root)
    const realNested = await fs.realpath(nested)
    const chain = deriveEffectiveInstructionChain(
      { vendorId: 'sst', productId: 'opencode', surfaceId: 'cli' },
      realRoot,
      realNested,
      scan.documents,
    )
    expect(chain.documents.map((item) => item.path)).toEqual([join(realNested, 'CLAUDE.md')])
  })

  it.each(['workbuddy', 'workbuddy-ai'] as const)(
    '%s recognizes its desktop surface while keeping project instructions unsupported',
    async (productId) => {
      const root = await createProject()
      await fs.writeFile(join(root, 'AGENTS.md'), 'shared instructions\n')
      const scan = await scanInstructionDocuments([root], { includeGlobal: false })
      const realRoot = await fs.realpath(root)
      const surface = { vendorId: 'tencent', productId, surfaceId: 'desktop' }
      expect(findInstructionProfile(surface)?.platformId).toBe(productId)
      expect(
        scan.documents.find((document) => document.fileName === 'AGENTS.md')?.bindings,
      ).toContainEqual(expect.objectContaining({ surface, role: 'unsupported' }))

      const chain = deriveEffectiveInstructionChain(surface, realRoot, realRoot, scan.documents)
      expect(chain.documents).toEqual([])
      expect(chain.warnings.map((warning) => warning.code)).toEqual(['unsupported'])
    },
  )

  it('blocks targets outside the project and unknown surfaces', async () => {
    const root = await createProject()
    const scan = await scanInstructionDocuments([root], { includeGlobal: false })
    const outside = deriveEffectiveInstructionChain(
      { vendorId: 'openai', productId: 'codex', surfaceId: 'cli' },
      root,
      join(root, '..', 'outside'),
      scan.documents,
    )
    expect(outside.warnings.map((warning) => warning.code)).toContain('target-outside-project')

    const unknown = deriveEffectiveInstructionChain(
      { vendorId: 'unknown', productId: 'unknown', surfaceId: 'unknown' },
      root,
      root,
      scan.documents,
    )
    expect(unknown.warnings.map((warning) => warning.code)).toContain('unknown-surface')
  })
})
