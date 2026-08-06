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
  /**
   * Brand fill color. Omitted for brands whose mark is pure black
   * (Cursor/Copilot/OpenCode) — those render in currentColor so they
   * stay visible in dark mode.
   */
  color?: string
  /** Monogram background color */
  bg?: string
}

const ICONS: Record<string, PlatformIconDef> = {
  'claude-code': { path: siClaude.path, color: `#${siClaude.hex}` },
  // OpenAI's mark is not distributable via simple-icons (trademark) —
  // use a monogram instead of an unofficial redraw.
  codex: { monogram: 'Cx' },
  copilot: { path: siGithubcopilot.path },
  cursor: { path: siCursor.path },
  'gemini-cli': { path: siGooglegemini.path, color: `#${siGooglegemini.hex}` },
  opencode: { path: siOpencode.path },
  codebuddy: { path: siCodebuddy.path, color: `#${siCodebuddy.hex}` },
  trae: { path: siTrae.path, color: '#17b877' },
  'trae-cn': { path: siTrae.path, color: '#17b877' },
  workbuddy: { monogram: 'W', bg: '#0052d9' },
}

export function platformIcon(id: string): PlatformIconDef {
  return ICONS[id] ?? { monogram: id.slice(0, 1).toUpperCase() }
}

export type { SimpleIcon }
