import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFilePreview } from './file-preview.js'

describe('readFilePreview', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-preview-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('reads text resources', async () => {
    const path = join(root, 'config.yaml')
    await fs.writeFile(path, 'name: preview\n', 'utf8')

    await expect(readFilePreview(path)).resolves.toEqual({
      kind: 'text',
      content: 'name: preview\n',
      truncated: false,
    })
  })

  it('returns raster images as data URLs', async () => {
    const path = join(root, 'preview.png')
    await fs.writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    await expect(readFilePreview(path)).resolves.toEqual({
      kind: 'image',
      dataUrl: 'data:image/png;base64,iVBORw==',
      mimeType: 'image/png',
      truncated: false,
    })
  })

  it('does not decode binary resources as text', async () => {
    const path = join(root, 'archive.bin')
    await fs.writeFile(path, Buffer.from([0x01, 0x00, 0x02]))

    await expect(readFilePreview(path)).resolves.toEqual({
      kind: 'unsupported',
      reason: 'binary',
      truncated: false,
    })
  })
})
