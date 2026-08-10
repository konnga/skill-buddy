import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { hashMcpSource, transactionalWriteMcpConfig } from '@skillbuddy/core'
import type { McpPathAccessPolicy } from './path-policy.js'
import type { McpPreparedMutation } from '@skillbuddy/core'

interface BackupRecord {
  id: string
  operationId: string
  mutation: McpPreparedMutation
  original: Buffer | null
  afterHash: string
  backupPath: string
}

/** 保存一分钟内可撤销的 MCP 原始配置，备份文件权限固定为 0600。 */
export class McpBackupStore {
  readonly #root: string
  readonly #operations = new Map<string, BackupRecord[]>()

  constructor(root: string) {
    this.#root = root
  }

  async stage(
    operationId: string,
    mutation: McpPreparedMutation,
    original: Buffer | null,
  ): Promise<BackupRecord> {
    const id = randomUUID()
    const directory = join(this.#root, operationId)
    const backupPath = join(directory, `${id}-${basename(mutation.source.configPath)}.bak`)
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    await fs.writeFile(backupPath, original ?? Buffer.alloc(0), { mode: 0o600 })
    const record: BackupRecord = {
      id,
      operationId,
      mutation,
      original,
      afterHash: hashMcpSource(mutation.afterText),
      backupPath,
    }
    const records = this.#operations.get(operationId) ?? []
    records.push(record)
    this.#operations.set(operationId, records)
    return record
  }

  async discard(record: BackupRecord): Promise<void> {
    const records = this.#operations.get(record.operationId) ?? []
    const remaining = records.filter((candidate) => candidate.id !== record.id)
    if (remaining.length > 0) this.#operations.set(record.operationId, remaining)
    else this.#operations.delete(record.operationId)
    await fs.unlink(record.backupPath).catch(() => undefined)
  }

  expire(operationId: string, delay = 60_000): void {
    setTimeout(() => void this.remove(operationId), delay).unref()
  }

  async restore(
    operationId: string,
    policy: McpPathAccessPolicy,
  ): Promise<{ path: string; ok: boolean; error?: string }[]> {
    const records = this.#operations.get(operationId)
    if (!records) return []
    const results: { path: string; ok: boolean; error?: string }[] = []
    const failedRecords: BackupRecord[] = []
    for (const record of [...records].reverse()) {
      try {
        await policy.assertWritable(record.mutation)
        if (record.original === null) {
          const current = await fs.readFile(record.mutation.source.configPath, 'utf8')
          if (hashMcpSource(current) !== record.afterHash) {
            throw new Error('配置在操作后又被修改，无法撤销')
          }
          await fs.unlink(record.mutation.source.configPath)
        } else {
          await transactionalWriteMcpConfig({
            path: record.mutation.source.configPath,
            content: record.original.toString('utf8'),
            expectedHash: record.afterHash,
          })
        }
        results.push({ path: record.mutation.source.configPath, ok: true })
      } catch (error) {
        failedRecords.push(record)
        results.push({
          path: record.mutation.source.configPath,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (failedRecords.length === 0) await this.remove(operationId)
    else this.#operations.set(operationId, failedRecords.reverse())
    return results
  }

  private async remove(operationId: string): Promise<void> {
    this.#operations.delete(operationId)
    await fs.rm(join(this.#root, operationId), { recursive: true, force: true })
  }
}
