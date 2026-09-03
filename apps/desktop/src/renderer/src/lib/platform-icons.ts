/*
 * @Author: wjc
 * @Date: 2026-08-10 10:14:11
 * @LastEditors: wjc
 * @LastEditTime: 2026-08-26 20:46:54
 * @Description:
 */
import claudeIcon from '@lobehub/icons-static-svg/icons/claude-color.svg'
import codebuddyIcon from '@lobehub/icons-static-svg/icons/codebuddy-color.svg'
import codexSvg from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import cursorSvg from '@lobehub/icons-static-svg/icons/cursor.svg?raw'
import deepseekIcon from '@lobehub/icons-static-svg/icons/deepseek-color.svg'
import doubaoIcon from '@/assets/platform-icons/doubao.webp'
import geminiIcon from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import githubcopilotSvg from '@lobehub/icons-static-svg/icons/githubcopilot.svg?raw'
import grokSvg from '@lobehub/icons-static-svg/icons/grok.svg?raw'
import hermesIcon from '@/assets/platform-icons/hermes.png'
import kimiSvg from '@lobehub/icons-static-svg/icons/kimi.svg?raw'
import opencodeSvg from '@lobehub/icons-static-svg/icons/opencode.svg?raw'
import ompIcon from '@/assets/platform-icons/omp.svg'
import piSvg from '@lobehub/icons-static-svg/icons/pi.svg?raw'
import qwenIcon from '@lobehub/icons-static-svg/icons/qwen-color.svg'
import traeIcon from '@lobehub/icons-static-svg/icons/trae-color.svg'
import workbuddyIcon from '@/assets/platform-icons/workbuddy.svg'
import wpsLingxiIcon from '@/assets/platform-icons/wps-lingxi.png'
import zcodeSvg from '@/assets/platform-icons/zcode.svg?raw'

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

/** 将单色 SVG 内联进 CSS mask，避免 file:// 下外部 SVG 掩码加载失败。 */
function svgMask(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const ICONS: Record<string, PlatformIconDef> = {
  'claude-code': { src: claudeIcon },
  codex: { maskSrc: svgMask(codexSvg) },
  copilot: { maskSrc: svgMask(githubcopilotSvg) },
  cursor: { maskSrc: svgMask(cursorSvg) },
  deepseek: { src: deepseekIcon },
  harness: { src: deepseekIcon },
  'gemini-cli': { src: geminiIcon },
  grok: { maskSrc: svgMask(grokSvg) },
  'grok-build': { maskSrc: svgMask(grokSvg) },
  'qwen-code': { src: qwenIcon },
  opencode: { maskSrc: svgMask(opencodeSvg) },
  pi: { maskSrc: svgMask(piSvg) },
  omp: { src: ompIcon },
  codebuddy: { src: codebuddyIcon },
  trae: { src: traeIcon },
  'trae-cn': { src: traeIcon },
  workbuddy: { src: workbuddyIcon },
  doubao: { src: doubaoIcon },
  'wps-lingxi': { src: wpsLingxiIcon },
  kimi: { maskSrc: svgMask(kimiSvg) },
  zcode: { maskSrc: svgMask(zcodeSvg) },
  'deepseek-harness': { src: deepseekIcon },
  hermes: { src: hermesIcon },
}

export function platformIcon(id: string): PlatformIconDef {
  return ICONS[id] ?? { monogram: id.slice(0, 1).toUpperCase() }
}
