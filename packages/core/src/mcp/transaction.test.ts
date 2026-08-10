import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hashMcpSource } from './normalize.js'
import { McpOperationError } from './operations.js'
import { transactionalWriteMcpConfig } from './transaction.js'

const temporaryDirectories: string[] = []

async function temporaryFile(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'skillbuddy-mcp-write-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'config.json')
  await writeFile(path, content, 'utf8')
  return path
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  )
})

describe('transactionalWriteMcpConfig', () => {
  it('atomically replaces content and preserves file permissions', async () => {
    const path = await temporaryFile('{"before":true}\n')
    await chmod(path, 0o640)
    const result = await transactionalWriteMcpConfig({
      path,
      content: '{"after":true}\n',
      expectedHash: hashMcpSource('{"before":true}\n'),
    })

    expect(await readFile(path, 'utf8')).toBe('{"after":true}\n')
    expect((await stat(path)).mode & 0o777).toBe(0o640)
    expect(result.created).toBe(false)
  })

  it('refuses to overwrite a concurrent change made after preview', async () => {
    const path = await temporaryFile('{"before":true}\n')
    const operation = transactionalWriteMcpConfig({
      path,
      content: '{"skillbuddy":true}\n',
      expectedHash: hashMcpSource('{"before":true}\n'),
      beforeCommit: async () => {
        await writeFile(path, '{"agent":true}\n', 'utf8')
      },
    })

    await expect(operation).rejects.toMatchObject<McpOperationError>({
      code: 'MCP_CONFIG_CHANGED',
    })
    expect(await readFile(path, 'utf8')).toBe('{"agent":true}\n')
  })

  it('can require that a target file does not exist', async () => {
    const path = await temporaryFile('{}\n')
    await expect(
      transactionalWriteMcpConfig({ path, content: '{"new":true}\n', expectedHash: null }),
    ).rejects.toMatchObject<McpOperationError>({ code: 'MCP_CONFIG_CHANGED' })
  })
})
