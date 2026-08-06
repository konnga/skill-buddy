export type MarketSourceId = 'skills-sh' | 'skillhub'

export interface MarketItem {
  key: string
  kind: MarketSourceId
  name: string
  description: string
  installs: number
  stars: number | null
  /** real icon url (SkillHub iconUrl / skills.sh repo-owner avatar); null -> letter badge */
  icon: string | null
  /** repo (skills.sh) or canonical name (skillhub) — shown under the title */
  sourceLabel: string
  /** external page to open */
  link: string
  /** skills.sh: repo + skill id */
  repo?: string
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
