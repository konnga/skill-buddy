import { compareSemver } from '@skillbuddy/core/semver'
import type { TeamLibraryPolicy } from './ipc.js'

export interface TeamLibraryPolicyState {
  required: boolean
  recommended: boolean
  blockedReason: string | null
}

export function emptyTeamPolicy(): TeamLibraryPolicy {
  return { required: { skills: [], mcp: [] }, recommended: { skills: [], mcp: [] }, blocked: [] }
}

/** 按组织、团队、项目的顺序合并策略，后层覆盖相同 ref + versions 的禁用规则。 */
export function mergeTeamPolicies(...policies: TeamLibraryPolicy[]): TeamLibraryPolicy {
  const blocked = new Map<string, TeamLibraryPolicy['blocked'][number]>()
  for (const policy of policies) {
    for (const item of policy.blocked) blocked.set(`${item.ref}\0${item.versions ?? ''}`, item)
  }
  return {
    required: {
      skills: [...new Set(policies.flatMap((policy) => policy.required.skills))],
      mcp: [...new Set(policies.flatMap((policy) => policy.required.mcp))],
    },
    recommended: {
      skills: [...new Set(policies.flatMap((policy) => policy.recommended.skills))],
      mcp: [...new Set(policies.flatMap((policy) => policy.recommended.mcp))],
    },
    blocked: [...blocked.values()],
  }
}

function matchesComparator(version: string, expression: string): boolean | null {
  const match = /^(<=|>=|<|>|=)?(\d+\.\d+\.\d+)$/.exec(expression.trim())
  if (!match) return null
  const compared = compareSemver(version, match[2]!)
  if (compared === null) return null
  switch (match[1] ?? '=') {
    case '<': return compared < 0
    case '<=': return compared <= 0
    case '>': return compared > 0
    case '>=': return compared >= 0
    default: return compared === 0
  }
}

/** 判断严格 x.y.z 版本是否满足由空格分隔的比较器集合。 */
export function matchesTeamVersionRange(version: string | undefined, range?: string): boolean {
  if (!range?.trim()) return true
  if (!version) return true
  const expressions = range.trim().split(/\s+/).filter(Boolean)
  const results = expressions.map((expression) => matchesComparator(version, expression))
  if (results.some((result) => result === null)) return true
  return results.length > 0 && results.every(Boolean)
}

/** 返回命中的禁用原因；未命中时返回 null。 */
export function blockedTeamAssetReason(
  policy: TeamLibraryPolicy,
  ref: string,
  version?: string,
): string | null {
  const rule = policy.blocked.find(
    (item) => item.ref === ref && matchesTeamVersionRange(version, item.versions),
  )
  return rule?.reason ?? null
}

export function teamAssetPolicyState(
  policy: TeamLibraryPolicy,
  type: 'skill' | 'mcp',
  ref: string,
  version?: string,
): TeamLibraryPolicyState {
  const field = type === 'skill' ? 'skills' : 'mcp'
  return {
    required: policy.required[field].includes(ref),
    recommended: policy.recommended[field].includes(ref),
    blockedReason: blockedTeamAssetReason(policy, ref, version),
  }
}
