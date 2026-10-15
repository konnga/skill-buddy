import { homedir } from 'node:os'
import { join } from 'node:path'
import { BUILTIN_PLATFORMS, type PlatformDef } from '../platforms.js'
import type { InstallScope, SkillRoot } from '../types.js'
import { exists } from './shared.js'
import { PlatformAdapter } from './platform-adapter.js'

/**
 * DeepSeek Harness（`dsh`）适配器。
 *
 * 它比通用适配器多做两件事，都来自 harness 自己的实现：
 *
 * - 用户根挂在 `<dshHome>/skills` 下，`dshHome` 取 `$DSH_HOME`、默认 `~/.dsh`，
 *   所以声明里的 `~/.dsh` 只是默认值，不能直接当结果用。
 * - 用户根里的 `.system` 子目录归 harness 自己所有，官方扫描会跳过它；这里登记为
 *   只读系统根，避免被当成普通用户 skill 改写或删除。
 */
export class DeepSeekHarnessAdapter extends PlatformAdapter {
  private readonly dshHome: string

  constructor(
    def: PlatformDef,
    homeDir: string = homedir(),
    dshHome: string = process.env.DSH_HOME || join(homeDir, '.dsh'),
  ) {
    super(def, homeDir)
    this.dshHome = dshHome
  }

  override async detect(): Promise<boolean> {
    return exists(this.dshHome)
  }

  override skillsDir(scope: InstallScope, projectRoot?: string): string | null {
    if (scope === 'user') return join(this.dshHome, 'skills')
    return super.skillsDir(scope, projectRoot)
  }

  async supplementalRoots(): Promise<SkillRoot[]> {
    return [
      {
        agent: this.agent,
        scope: 'user',
        path: join(this.dshHome, 'skills', '.system'),
        origin: 'system',
        readOnly: true,
        canToggle: false,
      },
    ]
  }
}

/** @deprecated Use DeepSeekHarnessAdapter.supplementalRoots(). */
export async function discoverDeepSeekHarnessSupplementalRoots(
  homeDir: string = homedir(),
  dshHome: string = process.env.DSH_HOME || join(homeDir, '.dsh'),
): Promise<SkillRoot[]> {
  const def = BUILTIN_PLATFORMS.find((platform) => platform.id === 'deepseek-harness')!
  return new DeepSeekHarnessAdapter(def, homeDir, dshHome).supplementalRoots()
}
