import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from '../platforms.js'
import { DeepSeekHarnessAdapter } from './deepseek-harness-adapter.js'

const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'deepseek-harness')!

describe('DeepSeekHarnessAdapter', () => {
  let home: string
  const originalDshHome = process.env.DSH_HOME

  beforeEach(async () => {
    // 默认根依赖环境变量，测试期间清掉，避免开发机上设置了 DSH_HOME 时结果漂移。
    delete process.env.DSH_HOME
    home = await fs.mkdtemp(join(tmpdir(), 'skm-dsh-'))
  })

  afterEach(async () => {
    if (originalDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalDshHome
    await fs.rm(home, { recursive: true, force: true })
  })

  it('resolves the user root below the default DSH home', () => {
    const adapter = new DeepSeekHarnessAdapter(def, home)

    expect(adapter.skillsDir('user')).toBe(join(home, '.dsh', 'skills'))
    expect(adapter.skillsDir('project', join(home, 'repo'))).toBe(
      join(home, 'repo', '.dsh', 'skills'),
    )
  })

  it('follows $DSH_HOME instead of the default home', async () => {
    const dshHome = join(home, 'custom-dsh')
    process.env.DSH_HOME = dshHome
    const adapter = new DeepSeekHarnessAdapter(def, home)

    expect(adapter.skillsDir('user')).toBe(join(dshHome, 'skills'))
    expect(await adapter.detect()).toBe(false)
    await fs.mkdir(dshHome, { recursive: true })
    expect(await adapter.detect()).toBe(true)
  })

  it('detects presence via the DSH home rather than a skills dir', async () => {
    const adapter = new DeepSeekHarnessAdapter(def, home)

    expect(await adapter.detect()).toBe(false)
    // 同名 skills 目录出现在别处不算已安装
    await fs.mkdir(join(home, 'skills'), { recursive: true })
    expect(await adapter.detect()).toBe(false)
    // 空的 DSH 主目录就算已安装：技能目录可以还没建
    await fs.mkdir(join(home, '.dsh'), { recursive: true })
    expect(await adapter.detect()).toBe(true)
  })

  it('registers the .system subdirectory as a read-only system root', async () => {
    const adapter = new DeepSeekHarnessAdapter(def, home)

    expect(await adapter.supplementalRoots()).toEqual([
      {
        agent: 'deepseek-harness',
        scope: 'user',
        path: join(home, '.dsh', 'skills', '.system'),
        origin: 'system',
        readOnly: true,
        canToggle: false,
      },
    ])
  })
})
