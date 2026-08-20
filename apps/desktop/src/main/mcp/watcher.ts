import { existsSync, watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { McpConfigSource } from '@skillbuddy/core'

/** 监听已注册 MCP 配置文件的父目录，并合并同目录下的多个来源。 */
export class McpConfigWatcher {
  readonly #watchers: FSWatcher[] = []
  #key = ''

  start(sources: McpConfigSource[], onChange: () => void): number {
    const byDirectory = new Map<string, Set<string>>()
    for (const source of sources) {
      const directory = dirname(source.configPath)
      if (!existsSync(directory)) continue
      const names = byDirectory.get(directory) ?? new Set<string>()
      names.add(basename(source.configPath))
      byDirectory.set(directory, names)
    }
    const nextKey = [...byDirectory.entries()]
      .flatMap(([directory, names]) => [...names].map((name) => `${directory}/${name}`))
      .sort()
      .join('\n')
    if (nextKey === this.#key) return this.#watchers.length
    this.stop()
    for (const [directory, names] of byDirectory) {
      try {
        this.#watchers.push(
          watch(directory, { persistent: false }, (_event, filename) => {
            if (!filename || names.has(filename.toString())) onChange()
          }),
        )
      } catch {
        // 单个目录不可监听时，扫描和手动刷新仍然可用。
      }
    }
    this.#key = nextKey
    return this.#watchers.length
  }

  stop(): void {
    for (const watcher of this.#watchers.splice(0)) watcher.close()
    this.#key = ''
  }
}
