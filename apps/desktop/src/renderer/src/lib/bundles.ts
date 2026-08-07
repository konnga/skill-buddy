import type { FoundSkill } from '@skillbuddy/core'
import type { MarketSourceId } from '@/lib/market'

export interface LocalizedText {
  'zh-CN': string
  en: string
}

/** One bundle member; `name` is the installed skill name (group membership key). */
export type BundleSkillRef =
  | { source: 'skills-sh'; repo: string; skillId: string; name: string }
  | { source: 'skillhub'; slug: string; namespace: string; name: string }

export interface SkillBundle {
  id: string
  name: LocalizedText
  description: LocalizedText
  skills: BundleSkillRef[]
}

/** When set, fetched at startup (via main process — renderer CSP blocks remote
    fetch) and replaces BUILT_IN_BUNDLES on success. Same JSON shape. */
export const REMOTE_BUNDLES_MANIFEST_URL = ''

const sh = (repo: string, skillId: string, name = skillId): BundleSkillRef => ({
  source: 'skills-sh',
  repo,
  skillId,
  name,
})

export const BUILT_IN_BUNDLES: SkillBundle[] = [
  {
    id: 'frontend',
    name: { 'zh-CN': '前端开发', en: 'Frontend' },
    description: {
      'zh-CN': 'React / Next.js / TypeScript 最佳实践与 Web 界面测试',
      en: 'React / Next.js / TypeScript best practices and web app testing',
    },
    skills: [
      sh('vercel-labs/agent-skills', 'vercel-react-best-practices'),
      sh('vercel-labs/agent-skills', 'web-design-guidelines'),
      sh('wshobson/agents', 'typescript-advanced-types'),
      sh('wshobson/agents', 'nextjs-app-router-patterns'),
      sh('anthropics/skills', 'webapp-testing'),
    ],
  },
  {
    id: 'design',
    name: { 'zh-CN': '设计', en: 'Design' },
    description: {
      'zh-CN': '界面视觉、海报画布与高级审美方向的设计类 skills',
      en: 'UI visuals, canvas art and high-end aesthetic direction',
    },
    skills: [
      sh('anthropics/skills', 'frontend-design'),
      sh('anthropics/skills', 'canvas-design'),
      sh('leonxlnx/taste-skill', 'design-taste-frontend'),
      sh('leonxlnx/taste-skill', 'high-end-visual-design'),
    ],
  },
  {
    id: 'backend',
    name: { 'zh-CN': '后端开发', en: 'Backend' },
    description: {
      'zh-CN': 'Node.js 服务端模式、测试策略与代码审查流程',
      en: 'Node.js server patterns, testing strategy and code review workflow',
    },
    skills: [
      sh('wshobson/agents', 'nodejs-backend-patterns'),
      sh('wshobson/agents', 'python-testing-patterns'),
      sh('mattpocock/skills', 'code-review'),
      sh('affaan-m/everything-claude-code', 'backend-patterns'),
    ],
  },
  {
    id: 'documents',
    name: { 'zh-CN': '文档办公', en: 'Documents' },
    description: {
      'zh-CN': 'Anthropic 官方 Word / PPT / Excel / PDF 处理四件套',
      en: 'Official Anthropic skills for Word, PowerPoint, Excel and PDF',
    },
    skills: [
      sh('anthropics/skills', 'docx'),
      sh('anthropics/skills', 'pptx'),
      sh('anthropics/skills', 'xlsx'),
      sh('anthropics/skills', 'pdf'),
    ],
  },
]

export function bundleText(txt: LocalizedText, locale: string): string {
  return txt[locale as keyof LocalizedText] ?? txt.en
}

/**
 * Soft dual-radial color washes per bundle. Alpha-based so they sit on
 * bg-card and adapt to light/dark without separate variants.
 */
const BUNDLE_GRADIENTS: Record<string, string> = {
  frontend:
    'radial-gradient(120% 110% at 0% 0%, rgba(59, 130, 246, 0.16), transparent 55%), radial-gradient(120% 110% at 100% 100%, rgba(34, 211, 238, 0.14), transparent 55%)',
  design:
    'radial-gradient(120% 110% at 0% 0%, rgba(244, 63, 94, 0.13), transparent 55%), radial-gradient(120% 110% at 100% 100%, rgba(251, 191, 36, 0.15), transparent 55%)',
  backend:
    'radial-gradient(120% 110% at 0% 0%, rgba(16, 185, 129, 0.15), transparent 55%), radial-gradient(120% 110% at 100% 100%, rgba(45, 212, 191, 0.13), transparent 55%)',
  documents:
    'radial-gradient(120% 110% at 0% 0%, rgba(245, 158, 11, 0.15), transparent 55%), radial-gradient(120% 110% at 100% 100%, rgba(249, 115, 22, 0.12), transparent 55%)',
}

const GRADIENT_POOL = Object.values(BUNDLE_GRADIENTS)

export function bundleGradient(id: string): string {
  if (BUNDLE_GRADIENTS[id]) return BUNDLE_GRADIENTS[id]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return GRADIENT_POOL[h % GRADIENT_POOL.length]!
}

const isLocalized = (v: unknown): v is LocalizedText =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as LocalizedText)['zh-CN'] === 'string' &&
  typeof (v as LocalizedText).en === 'string'

function isSkillRef(v: unknown): v is BundleSkillRef {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (typeof r.name !== 'string' || r.name.length === 0) return false
  if (r.source === 'skills-sh')
    return typeof r.repo === 'string' && typeof r.skillId === 'string'
  if (r.source === 'skillhub')
    return typeof r.slug === 'string' && typeof r.namespace === 'string'
  return false
}

/** Validate a remote manifest payload; invalid entries are dropped. */
export function parseBundlesManifest(raw: unknown): SkillBundle[] {
  if (!Array.isArray(raw)) return []
  const out: SkillBundle[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const b = entry as Record<string, unknown>
    if (typeof b.id !== 'string' || !isLocalized(b.name) || !isLocalized(b.description)) continue
    if (!Array.isArray(b.skills)) continue
    const skills = b.skills.filter(isSkillRef)
    if (skills.length === 0) continue
    out.push({ id: b.id, name: b.name, description: b.description, skills })
  }
  return out
}

/** Same matching as MarketDetailPage: exact name, dir suffix, skillhub single-skill zip. */
export function matchFoundSkill(
  items: FoundSkill[],
  wanted: string,
  kind: MarketSourceId,
): FoundSkill | undefined {
  return (
    items.find((f) => f.skill.name === wanted) ??
    items.find((f) => f.dir.endsWith(`/${wanted}`)) ??
    (kind === 'skillhub' ? items[0] : undefined)
  )
}
