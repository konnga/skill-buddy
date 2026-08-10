import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import type { McpConfigSource, McpPreparedMutation } from '@skillbuddy/core'

function sameSource(left: McpConfigSource, right: McpConfigSource): boolean {
  return (
    left.id === right.id &&
    resolve(left.configPath) === resolve(right.configPath) &&
    left.agent === right.agent &&
    left.surface === right.surface &&
    left.scope === right.scope &&
    (left.projectRoot ?? '') === (right.projectRoot ?? '') &&
    left.nodePath.join('\0') === right.nodePath.join('\0')
  )
}

/** MCP 配置文件白名单；来源只能由内置 Adapter 注册，Renderer 无法扩大范围。 */
export class McpPathAccessPolicy {
  readonly #sources = new Map<string, McpConfigSource>()
  readonly #projectRoots = new Set<string>()

  setSources(sources: McpConfigSource[], projectRoots: string[]): void {
    this.#sources.clear()
    this.#projectRoots.clear()
    for (const root of projectRoots) this.#projectRoots.add(resolve(root))
    for (const source of sources) this.#sources.set(source.id, source)
  }

  async assertWritable(mutation: McpPreparedMutation): Promise<void> {
    const allowed = this.#sources.get(mutation.source.id)
    if (!allowed || !sameSource(allowed, mutation.source)) {
      throw new Error('MCP 配置来源未获授权')
    }
    if (allowed.readOnly) throw new Error('MCP 配置来源为只读')
    if (
      (allowed.scope === 'project' || allowed.scope === 'local') &&
      (!allowed.projectRoot || !this.#projectRoots.has(resolve(allowed.projectRoot)))
    ) {
      throw new Error('MCP 项目配置不属于已登记的项目目录')
    }

    const path = resolve(allowed.configPath)
    try {
      const info = await fs.lstat(path)
      if (info.isSymbolicLink()) throw new Error('MCP 配置文件不能是符号链接')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
