import { createHash, randomUUID } from 'node:crypto'
import { constants, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { McpOperationError } from './operations.js'

export interface McpTransactionalWriteInput {
  path: string
  content: string
  /** null 表示计划创建新文件；undefined 表示调用方不要求乐观锁。 */
  expectedHash?: string | null
  beforeCommit?: (original: Buffer | null) => Promise<void>
}

export interface McpTransactionalWriteResult {
  beforeHash: string | null
  afterHash: string
  created: boolean
}

function hash(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

async function readCurrent(path: string): Promise<{ content: Buffer; mode: number } | null> {
  try {
    const [content, stat] = await Promise.all([fs.readFile(path), fs.stat(path)])
    return { content, mode: stat.mode }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function assertExpectedHash(actual: string | null, expected: string | null | undefined): void {
  if (expected === undefined || actual === expected) return
  throw new McpOperationError(
    'MCP_CONFIG_CHANGED',
    'MCP 配置在预览后已被其他程序修改，请刷新后重试',
  )
}

/** 在同目录写入临时文件并原子替换，提交前再次校验源文件 Hash。 */
export async function transactionalWriteMcpConfig(
  input: McpTransactionalWriteInput,
): Promise<McpTransactionalWriteResult> {
  const directory = dirname(input.path)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const initial = await readCurrent(input.path)
  const beforeHash = initial ? hash(initial.content) : null
  assertExpectedHash(beforeHash, input.expectedHash)

  const temporaryPath = join(directory, `.skillbuddy-${randomUUID()}.tmp`)
  let temporaryCreated = false
  try {
    const handle = await fs.open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      initial ? initial.mode : 0o600,
    )
    temporaryCreated = true
    try {
      await handle.writeFile(input.content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (initial) await fs.chmod(temporaryPath, initial.mode)

    if (input.beforeCommit) await input.beforeCommit(initial?.content ?? null)
    const latest = await readCurrent(input.path)
    const latestHash = latest ? hash(latest.content) : null
    assertExpectedHash(latestHash, beforeHash)

    await fs.rename(temporaryPath, input.path)
    temporaryCreated = false
    try {
      const directoryHandle = await fs.open(directory, constants.O_RDONLY)
      try {
        await directoryHandle.sync()
      } finally {
        await directoryHandle.close()
      }
    } catch {
      // Windows 等平台可能不允许 fsync 目录；文件本身已经安全同步。
    }

    return {
      beforeHash,
      afterHash: hash(Buffer.from(input.content)),
      created: initial === null,
    }
  } catch (error) {
    if (error instanceof McpOperationError) throw error
    throw new McpOperationError(
      'MCP_WRITE_FAILED',
      `写入 MCP 配置失败：${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    if (temporaryCreated) await fs.unlink(temporaryPath).catch(() => undefined)
  }
}
