/*
 * @Author: wjc
 * @Date: 2026-08-10 10:14:11
 * @LastEditors: wjc
 * @LastEditTime: 2026-08-19 00:02:10
 * @Description:
 */
import claudeIcon from '@lobehub/icons-static-svg/icons/claude-color.svg'
import codebuddyIcon from '@lobehub/icons-static-svg/icons/codebuddy-color.svg'
import codexIcon from '@lobehub/icons-static-svg/icons/openai.svg'
import cursorIcon from '@lobehub/icons-static-svg/icons/cursor.svg'
import doubaoIcon from '@/assets/platform-icons/doubao.webp'
import geminiIcon from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import githubcopilotIcon from '@lobehub/icons-static-svg/icons/githubcopilot.svg'
import kimiIcon from '@lobehub/icons-static-svg/icons/kimi.svg'
import opencodeIcon from '@lobehub/icons-static-svg/icons/opencode.svg'
import traeIcon from '@lobehub/icons-static-svg/icons/trae-color.svg'
import workbuddyIcon from '@/assets/platform-icons/workbuddy.svg'
import zcodeIcon from '@/assets/platform-icons/zcode.svg'

interface PlatformIconDef {
  /** Full image asset URL (for complex multi-element brand marks) */
  src?: string
  /** Monochrome image asset rendered as a mask so it inherits currentColor */
  maskSrc?: string
  /** Fallback monogram when no brand icon is available */
  monogram?: string
  /** Monogram background color */
  bg?: string
}

const ICONS: Record<string, PlatformIconDef> = {
  'claude-code': { src: claudeIcon },
  codex: { src: codexIcon },
  copilot: { src: githubcopilotIcon },
  cursor: { src: cursorIcon },
  'gemini-cli': { src: geminiIcon },
  opencode: { src: opencodeIcon },
  codebuddy: { src: codebuddyIcon },
  trae: { src: traeIcon },
  'trae-cn': { src: traeIcon },
  workbuddy: { src: workbuddyIcon },
  doubao: { src: doubaoIcon },
  kimi: { src: kimiIcon },
  zcode: { src: zcodeIcon },
}

export function platformIcon(id: string): PlatformIconDef {
  return ICONS[id] ?? { monogram: id.slice(0, 1).toUpperCase() }
}
