import {
  siClaude,
  siCodebuddy,
  siCursor,
  siGithubcopilot,
  siGooglegemini,
  siOpencode,
  siTrae,
  type SimpleIcon,
} from 'simple-icons'

interface PlatformIconDef {
  /** SVG path (24x24 viewBox) from simple-icons */
  path?: string
  /** Fallback monogram when no brand icon is available */
  monogram?: string
  /** Brand color (for the optional colored mode) */
  hex?: string
}

const icon = (si: SimpleIcon): PlatformIconDef => ({ path: si.path, hex: `#${si.hex}` })

const ICONS: Record<string, PlatformIconDef> = {
  'claude-code': icon(siClaude),
  // OpenAI's mark is not distributable via simple-icons (trademark) —
  // use a monogram instead of an unofficial redraw.
  codex: { monogram: 'Cx' },
  copilot: icon(siGithubcopilot),
  cursor: icon(siCursor),
  'gemini-cli': icon(siGooglegemini),
  opencode: icon(siOpencode),
  codebuddy: icon(siCodebuddy),
  trae: icon(siTrae),
  'trae-cn': icon(siTrae),
  workbuddy: { monogram: 'W' },
}

export function platformIcon(id: string): PlatformIconDef {
  return ICONS[id] ?? { monogram: id.slice(0, 1).toUpperCase() }
}
