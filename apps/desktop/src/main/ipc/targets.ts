import { getAdapter, type Skill } from '@skillbuddy/core'
import type { InstallTarget, TargetResult } from '#shared/ipc'
import type { PathAccessPolicy } from '../path-policy'

/** 在多个安装目标上并行执行操作，并保留逐目标错误。 */
export async function runTargets(
  targets: InstallTarget[],
  run: (target: InstallTarget) => Promise<unknown>,
): Promise<TargetResult[]> {
  const results = await Promise.allSettled(targets.map(run))
  return results.map((result, index) => ({
    target: targets[index]!,
    ok: result.status === 'fulfilled',
    error:
      result.status === 'rejected'
        ? String(result.reason?.message ?? result.reason)
        : undefined,
  }))
}

/** 使用对应平台 Adapter 安装一个 Skill。 */
export function installTarget(
  skill: Skill,
  target: InstallTarget,
  pathPolicy: PathAccessPolicy,
): Promise<string> {
  const adapter = getAdapter(target.agent)
  const root = adapter.skillsDir(target.scope, target.projectRoot)
  if (!root) throw new Error(`${target.agent}: no skills directory for scope "${target.scope}"`)
  pathPolicy.assertWritableTargetRoot(root)
  return adapter.install(skill, target.scope, target.projectRoot)
}
