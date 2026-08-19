import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, parse, resolve } from 'node:path'
import {
  allMcpAdapters,
  rebaseMcpMutation,
  scanMcpServers,
  transactionalWriteMcpConfig,
  validateMcpDefinition,
  type McpAdapter,
  type McpConfigSource,
  type McpOperationIntent,
  type McpOperationPlanView,
  type McpOperationRequestResult,
  type McpPlanActionView,
  type McpPlanIssueView,
  type McpPreparedMutation,
  type McpScanResult,
  type McpTarget,
} from '@skillbuddy/core'
import type {
  McpRemovePlanRequest,
  McpTogglePlanRequest,
  McpUpsertPlanRequest,
} from '#shared/ipc'
import { McpBackupStore } from './backups'
import { McpPathAccessPolicy } from './path-policy'
import { McpConfigWatcher } from './watcher'

interface StoredPlan {
  view: McpOperationPlanView
  mutations: McpPreparedMutation[]
}

const PLAN_TTL = 5 * 60_000
// 撤销窗口需覆盖 bundle 逐个确认多份计划、以及 skill 安装（可能克隆 git 仓库）的耗时，
// 否则撤销提示出现时对应备份可能已过期。
const BACKUP_TTL = 10 * 60_000

export interface McpServiceOptions {
  adapters?: readonly McpAdapter[]
  planTtl?: number
  backupTtl?: number
}

const MAX_PROJECT_ROOTS = 64

/**
 * 净化 Renderer 传入的项目根目录：路径策略的写入白名单由此推导，
 * 不能让任意 IPC 输入直接成为合法写入范围。仅接受真实存在的绝对路径目录，
 * 并排除文件系统根与用户主目录本身。
 */
async function sanitizeProjectRoots(roots: unknown): Promise<string[]> {
  if (!Array.isArray(roots)) return []
  const home = resolve(homedir())
  const sanitized = new Set<string>()
  for (const root of roots.slice(0, MAX_PROJECT_ROOTS)) {
    if (typeof root !== 'string' || !root.trim() || /[\u0000-\u001f]/.test(root)) continue
    if (!isAbsolute(root)) continue
    const resolved = resolve(root)
    if (resolved === home || parse(resolved).root === resolved) continue
    try {
      if ((await fs.stat(resolved)).isDirectory()) sanitized.add(resolved)
    } catch {
      // 目录不存在或不可访问：跳过，不作为项目根登记。
    }
  }
  return [...sanitized]
}

function targetOfSource(source: McpConfigSource): McpTarget {
  return {
    agent: source.agent,
    surface: source.surface,
    scope: source.scope,
    projectRoot: source.projectRoot,
  }
}

function issueView(
  issue: { code: string; message: string; field?: string },
  target?: McpTarget,
): McpPlanIssueView {
  return { ...issue, target }
}

/** MCP 主进程领域服务：计划内容留在主进程，Renderer 只持有短期 planId。 */
export class McpService {
  readonly #adapters: readonly McpAdapter[]
  readonly #adapterMap: Map<string, McpAdapter>
  readonly #backupTtl: number
  readonly #plans = new Map<string, StoredPlan>()
  readonly #planTtl: number
  readonly #policy = new McpPathAccessPolicy()
  readonly #backups: McpBackupStore
  readonly #watcher = new McpConfigWatcher()
  #projectRoots: string[] = []
  #lastScan: McpScanResult | null = null
  #sources: McpConfigSource[] = []

  constructor(backupRoot: string, options: McpServiceOptions = {}) {
    this.#adapters = options.adapters ?? allMcpAdapters()
    this.#adapterMap = new Map(
      this.#adapters.map((adapter) => [`${adapter.agent}:${adapter.surface}`, adapter]),
    )
    this.#planTtl = options.planTtl ?? PLAN_TTL
    this.#backupTtl = options.backupTtl ?? BACKUP_TTL
    this.#backups = new McpBackupStore(backupRoot)
    // 上次会话遗留的备份无法恢复（索引只在内存），启动时直接清扫。
    void this.#backups.sweep()
  }

  async scan(projectRoots: string[] = []): Promise<McpScanResult> {
    this.#projectRoots = await sanitizeProjectRoots(projectRoots)
    this.#sources = (
      await Promise.all(
        this.#adapters.map((adapter) => adapter.configSources(this.#projectRoots)),
      )
    ).flat()
    this.#policy.setSources(this.#sources, this.#projectRoots)
    this.#lastScan = await scanMcpServers(this.#projectRoots, this.#adapters)
    return this.#lastScan
  }

  watch(onChange: () => void): number {
    return this.#watcher.start(this.#sources, onChange)
  }

  dispose(): void {
    this.#watcher.stop()
  }

  async createUpsertPlan(request: McpUpsertPlanRequest): Promise<McpOperationPlanView> {
    const scan = await this.scan(request.projectRoots)
    const definition = request.definition
      ? request.definition
      : scan.installations.find((item) => item.id === request.sourceInstallationId)?.definition
    if (!definition) throw new Error('找不到用于同步的 MCP Server 定义')
    // 表单等 IPC 传入的定义按新建路径严格校验；扫描得到的定义已脱敏，
    // 其中的占位符字段由 nonExportableFields 生成的计划阻断项处理，不在此硬拒。
    validateMcpDefinition(definition, { source: request.definition ? 'user-input' : 'scan' })
    return this.createPlan(
      'upsert',
      'upsert',
      definition.name,
      request.targets,
      async (target) => {
        const adapter = this.getAdapter(target)
        const projection = adapter.project(definition, target)
        if (projection.blockers.length > 0) {
          return {
            blockers: projection.blockers.map((issue) => issueView(issue, target)),
            warnings: projection.warnings.map((issue) => issueView(issue, target)),
          }
        }
        return {
          mutation: await adapter.prepareUpsert(definition, target),
          warnings: projection.warnings.map((issue) => issueView(issue, target)),
        }
      },
    )
  }

  async createRemovePlan(request: McpRemovePlanRequest): Promise<McpOperationPlanView> {
    const scan = await this.scan(request.projectRoots)
    const installations = request.installationIds.map((id) =>
      scan.installations.find((item) => item.id === id),
    )
    if (installations.some((item) => !item)) throw new Error('找不到待卸载的 MCP 安装')
    const items = installations.filter((item): item is NonNullable<typeof item> => Boolean(item))
    const name = items[0]?.definition.name
    if (!name || items.some((item) => item.definition.name !== name)) {
      throw new Error('一次卸载计划只能处理同一个 MCP Server')
    }
    return this.createPlan(
      'remove',
      'remove',
      name,
      items.map((item) => targetOfSource(item.source)),
      async (target) => ({
        mutation: await this.getAdapter(target).prepareRemove(name, target),
      }),
    )
  }

  async createTogglePlan(request: McpTogglePlanRequest): Promise<McpOperationPlanView> {
    const scan = await this.scan(request.projectRoots)
    const installations = request.installationIds.map((id) =>
      scan.installations.find((item) => item.id === id),
    )
    if (installations.some((item) => !item)) throw new Error('找不到待切换的 MCP 安装')
    const items = installations.filter((item): item is NonNullable<typeof item> => Boolean(item))
    const name = items[0]?.definition.name
    if (!name || items.some((item) => item.definition.name !== name)) {
      throw new Error('一次启停计划只能处理同一个 MCP Server')
    }
    return this.createPlan(
      'toggle',
      request.enabled ? 'enable' : 'disable',
      name,
      items.map((item) => targetOfSource(item.source)),
      async (target) => ({
        mutation: await this.getAdapter(target).prepareToggle(
          name,
          request.enabled,
          target,
        ),
      }),
    )
  }

  async applyPlan(planId: string): Promise<McpOperationRequestResult> {
    const stored = this.#plans.get(planId)
    if (!stored || stored.view.expiresAt < Date.now()) {
      this.#plans.delete(planId)
      throw new Error('MCP 操作计划已过期，请重新预览')
    }
    if (stored.view.blockers.length > 0) throw new Error('MCP 操作计划包含阻断项')
    if (!stored.view.canApply) throw new Error('MCP 操作计划没有可执行的变更')

    const operationId = randomUUID()
    const results: McpOperationRequestResult['results'] = []
    for (const mutation of stored.mutations) {
      let backup: Awaited<ReturnType<McpBackupStore['stage']>> | undefined
      try {
        await this.#policy.assertWritable(mutation)
        await transactionalWriteMcpConfig({
          path: mutation.source.configPath,
          content: mutation.afterText,
          expectedHash: mutation.beforeHash,
          beforeCommit: async (original) => {
            backup = await this.#backups.stage(operationId, mutation, original)
          },
        })
        results.push({ sourceId: mutation.source.id, path: mutation.source.configPath, ok: true })
      } catch (error) {
        if (backup) await this.#backups.discard(backup)
        const candidate = error as { code?: unknown; message?: unknown }
        results.push({
          sourceId: mutation.source.id,
          path: mutation.source.configPath,
          ok: false,
          code: typeof candidate.code === 'string' ? candidate.code : 'MCP_WRITE_FAILED',
          error: typeof candidate.message === 'string' ? candidate.message : String(error),
        })
      }
    }
    this.#plans.delete(planId)
    if (results.some((result) => result.ok)) this.#backups.expire(operationId, this.#backupTtl)
    return { operationId, results }
  }

  restore(operationId: string): Promise<{ path: string; ok: boolean; error?: string }[]> {
    return this.#backups.restore(operationId, this.#policy)
  }

  private async createPlan(
    kind: 'upsert' | 'remove' | 'toggle',
    intent: McpOperationIntent,
    name: string,
    targets: McpTarget[],
    prepare: (target: McpTarget) => Promise<{
      mutation?: McpPreparedMutation
      blockers?: McpPlanIssueView[]
      warnings?: McpPlanIssueView[]
    }>,
  ): Promise<McpOperationPlanView> {
    const planId = randomUUID()
    const expiresAt = Date.now() + this.#planTtl
    const blockers: McpPlanIssueView[] = []
    const warnings: McpPlanIssueView[] = []
    const actions: McpPlanActionView[] = []
    const mutations = new Map<string, McpPreparedMutation>()

    for (const target of targets) {
      this.assertTargetProject(target)
      try {
        const prepared = await prepare(target)
        blockers.push(...(prepared.blockers ?? []))
        warnings.push(...(prepared.warnings ?? []))
        if (!prepared.mutation) continue
        const mutation = prepared.mutation
        const key = resolve(mutation.source.configPath)
        const existing = mutations.get(key)
        const beforeActionText = existing?.afterText ?? mutation.beforeText
        if (existing) existing.afterText = rebaseMcpMutation(mutation, existing.afterText)
        else mutations.set(key, mutation)
        const afterActionText = (existing ?? mutation).afterText
        actions.push({
          kind,
          name,
          target,
          sourceId: mutation.source.id,
          configPath: mutation.source.configPath,
          changed: beforeActionText !== afterActionText,
        })
      } catch (error) {
        const candidate = error as { code?: unknown; message?: unknown }
        blockers.push({
          code: typeof candidate.code === 'string' ? candidate.code : 'MCP_WRITE_FAILED',
          message: typeof candidate.message === 'string' ? candidate.message : String(error),
          target,
        })
      }
    }

    const effectiveMutations = [...mutations.values()].filter(
      (mutation) => mutation.beforeText !== mutation.afterText,
    )
    const view: McpOperationPlanView = {
      planId,
      kind,
      intent,
      name,
      expiresAt,
      actions,
      blockers,
      warnings,
      canApply: blockers.length === 0 && effectiveMutations.length > 0,
    }
    this.#plans.set(planId, { view, mutations: effectiveMutations })
    setTimeout(() => this.#plans.delete(planId), this.#planTtl).unref()
    return view
  }

  private getAdapter(target: McpTarget): McpAdapter {
    const adapter = this.#adapterMap.get(`${target.agent}:${target.surface}`)
    if (!adapter) throw new Error(`不支持 MCP 平台入口 ${target.agent}:${target.surface}`)
    return adapter
  }

  private assertTargetProject(target: McpTarget): void {
    if (target.scope === 'user') return
    if (!target.projectRoot || !this.#projectRoots.includes(resolve(target.projectRoot))) {
      throw new Error('MCP 目标项目未登记')
    }
  }
}
