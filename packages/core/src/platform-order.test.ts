import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 平台本体查询会去问系统（mdfind / system_profiler），这里直接挡掉：测试只关心顺序，
// 不该依赖测试机上装了什么应用。
vi.mock('./platform-installation.js', () => ({
  lookupPlatformApplication: vi.fn().mockResolvedValue('missing'),
}))

import { BUILTIN_PLATFORMS, comparePlatformDisplayName } from './platforms.js'
import { listPlatformStatus } from './scanner.js'

let home: string

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'skm-platform-order-'))
})

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe('平台列表顺序', () => {
  it('按显示名排序，而不是按内置表的声明顺序', async () => {
    const names = (await listPlatformStatus(home, 'darwin')).map((status) => status.displayName)
    const declared = BUILTIN_PLATFORMS.map((platform) => platform.displayName)
    const sorted = [...declared].sort(comparePlatformDisplayName)

    expect(names).toEqual(sorted)
    // 声明顺序本身不是字母序，否则上面那条断言抓不到「忘了排序」。
    expect(sorted).not.toEqual(declared)
  })
})
