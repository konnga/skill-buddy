import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveResourcePath } from './resource-path.js'

describe('resolveResourcePath', () => {
  it('resolves nested resource files inside the Skill directory', () => {
    const root = join(tmpdir(), 'example')
    expect(resolveResourcePath(root, 'references/guide.md')).toBe(
      join(root, 'references', 'guide.md'),
    )
  })

  it('rejects traversal, absolute paths and SKILL.md replacement', () => {
    const root = join(tmpdir(), 'example')
    for (const path of ['../secret', 'references/../../secret', '/etc/passwd', 'SKILL.md']) {
      expect(() => resolveResourcePath(root, path)).toThrow('resource path')
    }
  })
})
