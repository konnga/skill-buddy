import type { FoundSkill } from '@skillbuddy/core'

export type MarketSourceId = 'skills-sh' | 'skillhub' | 'github'

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
