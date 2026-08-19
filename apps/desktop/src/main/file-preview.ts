import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { FilePreviewResult } from '#shared/ipc'

const maxTextPreviewBytes = 256 * 1024
const maxImagePreviewBytes = 8 * 1024 * 1024

const imageMimeTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
])

const unsupportedExtensions = new Set([
  '.7z',
  '.avi',
  '.bz2',
  '.dll',
  '.dylib',
  '.eot',
  '.gz',
  '.icns',
  '.ico',
  '.mov',
  '.mp3',
  '.mp4',
  '.node',
  '.otf',
  '.pdf',
  '.so',
  '.tar',
  '.ttf',
  '.wasm',
  '.woff',
  '.woff2',
  '.zip',
])

async function readPrefix(path: string, bytes: number): Promise<Buffer> {
  const handle = await fs.open(path, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/** 在不向渲染进程暴露本地文件地址的前提下读取受限大小的预览。 */
export async function readFilePreview(path: string): Promise<FilePreviewResult> {
  const stat = await fs.stat(path)
  if (!stat.isFile()) throw new Error(`path is not a file: ${path}`)

  const extension = extname(path).toLowerCase()
  const imageMimeType = imageMimeTypes.get(extension)
  if (imageMimeType) {
    if (stat.size > maxImagePreviewBytes) {
      return { kind: 'unsupported', reason: 'too-large', truncated: false }
    }
    const content = await fs.readFile(path)
    return {
      kind: 'image',
      dataUrl: `data:${imageMimeType};base64,${content.toString('base64')}`,
      mimeType: imageMimeType,
      truncated: false,
    }
  }

  if (unsupportedExtensions.has(extension)) {
    return { kind: 'unsupported', reason: 'binary', truncated: false }
  }

  const previewBytes = Math.min(stat.size, maxTextPreviewBytes)
  const content = await readPrefix(path, previewBytes)
  if (content.includes(0)) {
    return { kind: 'unsupported', reason: 'binary', truncated: false }
  }
  return {
    kind: 'text',
    content: content.toString('utf8'),
    truncated: stat.size > maxTextPreviewBytes,
  }
}
