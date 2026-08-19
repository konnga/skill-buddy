import type { FoundSkill } from '@skillbuddy/core'

export type MarketSourceId = 'skills-sh' | 'skillhub' | 'github'

export type MarketSkillSource =
  | { kind: 'skills-sh'; repo: string; skillId: string }
  | { kind: 'skillhub'; slug: string; namespace: string }
  | { kind: 'github'; repo: string }

export interface MarketItem {
  key: string
  kind: MarketSourceId
  name: string
  description: string
  installs: number
  stars: number | null
  /** real icon url (SkillHub iconUrl / skills.sh repo-owner avatar); null -> letter badge */
  icon: string | null
  version?: string | null
  updatedAt?: number | null
  verified?: boolean
  requiresApiKey?: boolean
  /** sub-category names (SkillHub, localized) */
  tags?: string[]
  /** repository or canonical name — shown under the title */
  sourceLabel: string
  /** external page to open */
  link: string
  /** GitHub-backed sources: repository */
  repo?: string
  /** skills.sh: skill id */
  skillId?: string
  /** skillhub: slug + namespace */
  slug?: string
  namespace?: string
}

export interface FetchedMarketSkill {
  root: string
  found: FoundSkill | null
}

/** 提取可持久化的最小市场来源，供技能包稍后补装本地缺失成员。 */
export function marketSkillSource(item: MarketItem): MarketSkillSource | null {
  if (item.kind === 'skills-sh') {
    return item.repo && item.skillId
      ? { kind: item.kind, repo: item.repo, skillId: item.skillId }
      : null
  }
  if (item.kind === 'skillhub') {
    return item.slug
      ? { kind: item.kind, slug: item.slug, namespace: item.namespace ?? '' }
      : null
  }
  return item.repo ? { kind: item.kind, repo: item.repo } : null
}

/** deterministic icon color per skill name */
const ICON_COLORS = [
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-fuchsia-500',
  'bg-lime-600',
]

export function marketIconColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ICON_COLORS[h % ICON_COLORS.length]!
}

export function marketIconGlyph(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

export function formatMarketCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** 下载市场资源，并返回临时目录中的全部 Skill。调用方负责清理 root。 */
export function fetchMarketSkillSource(
  item: MarketItem,
): Promise<{ root: string; items: FoundSkill[] }> {
  return item.kind === 'skills-sh' || item.kind === 'github'
    ? window.skillsManager.importFromGit(`https://github.com/${item.repo}`)
    : window.skillsManager.skillhubFetch(item.slug!, item.namespace ?? '')
}

/** 从市场下载结果中定位用户选择的具体 Skill。 */
export function matchMarketSkill(item: MarketItem, items: FoundSkill[]): FoundSkill | undefined {
  const wanted = item.kind === 'skills-sh'
    ? item.skillId!
    : item.kind === 'skillhub'
      ? item.slug!
      : item.name
  return items.find((found) => found.skill.name === wanted) ??
    items.find((found) => found.dir.endsWith(`/${wanted}`)) ??
    (item.kind !== 'skills-sh' ? items[0] : undefined)
}

/** 按已记录来源下载并精确定位 Skill；临时目录由调用方负责清理。 */
export async function fetchMarketSkillBySource(
  source: MarketSkillSource,
  expectedName: string,
): Promise<FetchedMarketSkill> {
  const result = source.kind === 'skillhub'
    ? await window.skillsManager.skillhubFetch(source.slug, source.namespace)
    : await window.skillsManager.importFromGit(`https://github.com/${source.repo}`)
  const wanted = source.kind === 'skills-sh'
    ? source.skillId
    : source.kind === 'skillhub'
      ? source.slug
      : expectedName
  const found = result.items.find((item) => item.skill.name === wanted) ??
    result.items.find((item) => item.dir.endsWith(`/${wanted}`)) ??
    (source.kind === 'skillhub' ? result.items[0] : undefined)
  return { root: result.root, found: found ?? null }
}

/**
 * 为旧版只保存名称的技能包恢复唯一市场来源。只接受精确名称或
 * slug/skillId 匹配，仓库名称不作为 Skill 名称使用。
 */
export async function resolveMarketSkillSource(name: string): Promise<MarketSkillSource | null> {
  const [skillsShResult, skillhubResult] = await Promise.allSettled([
    window.skillsManager.marketSearch(name),
    window.skillsManager.skillhubSearch(name, 1),
  ])
  const sources: MarketSkillSource[] = []
  if (skillsShResult.status === 'fulfilled') {
    for (const item of skillsShResult.value) {
      if (item.skillId === name || item.name === name) {
        sources.push({ kind: 'skills-sh', repo: item.source, skillId: item.skillId })
      }
    }
  }
  if (skillhubResult.status === 'fulfilled') {
    for (const item of skillhubResult.value.items) {
      if (item.slug === name || item.name === name || item.canonicalName === name) {
        sources.push({
          kind: 'skillhub',
          slug: item.slug,
          namespace: item.namespace,
        })
      }
    }
  }

  const unique = new Map(sources.map((source) => [JSON.stringify(source), source]))
  if (unique.size === 1) return [...unique.values()][0]!
  return null
}
