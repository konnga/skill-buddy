import { ref, watch } from 'vue'

/**
 * 单个明/暗模式下可自定义的颜色配置。
 */
export interface ModeColors {
  /** 强调色（驱动主按钮、开关、滑块、焦点环），#rrggbb */
  accent: string
  /** 页面背景色，#rrggbb */
  background: string
  /** 前景（正文文字）色，#rrggbb */
  foreground: string
  /** 界面对比度 0–100，50 为默认（影响卡片/边框等派生表面的深浅） */
  contrast: number
}

/**
 * 外观自定义配置：明暗两套颜色 + 侧边栏材质。
 */
export interface AppearanceConfig {
  light: ModeColors
  dark: ModeColors
  /** macOS 窗口 vibrancy 透出的半透明侧边栏 */
  translucentSidebar: boolean
}

/** 与 main.css 中 oklch 默认 token 对应的十六进制近似值。 */
export const defaultAppearance: AppearanceConfig = {
  light: { accent: '#171717', background: '#ffffff', foreground: '#171717', contrast: 50 },
  dark: { accent: '#e8e8e8', background: '#131313', foreground: '#e8e8e8', contrast: 50 },
  translucentSidebar: true,
}

export interface ThemePreset {
  id: string
  /** i18n 文案键（settings.* 下） */
  labelKey: string
  light: ModeColors
  dark: ModeColors
}

export const themePresets: ThemePreset[] = [
  {
    id: 'default',
    labelKey: 'settings.appearancePresetDefault',
    light: { ...defaultAppearance.light },
    dark: { ...defaultAppearance.dark },
  },
  {
    id: 'absolutely',
    labelKey: 'settings.appearancePresetAbsolutely',
    light: { accent: '#d97757', background: '#fbfaf8', foreground: '#2f2b28', contrast: 48 },
    dark: { accent: '#e38b6d', background: '#1c1917', foreground: '#f5f2ef', contrast: 55 },
  },
  {
    id: 'azure',
    labelKey: 'settings.appearancePresetAzure',
    light: { accent: '#2563eb', background: '#ffffff', foreground: '#1f2328', contrast: 50 },
    dark: { accent: '#339cff', background: '#181818', foreground: '#ffffff', contrast: 60 },
  },
  {
    id: 'cappuccino',
    labelKey: 'settings.appearancePresetCappuccino',
    light: { accent: '#7c3aed', background: '#faf7f2', foreground: '#2d2830', contrast: 48 },
    dark: { accent: '#c4a7e7', background: '#191724', foreground: '#e0def4', contrast: 55 },
  },
  {
    id: 'everforest',
    labelKey: 'settings.appearancePresetEverforest',
    light: { accent: '#7f9d55', background: '#fdf6e3', foreground: '#3a4439', contrast: 48 },
    dark: { accent: '#a7c080', background: '#2d353b', foreground: '#d3c6aa', contrast: 52 },
  },
  {
    id: 'linear',
    labelKey: 'settings.appearancePresetLinear',
    light: { accent: '#5e6ad2', background: '#f7f8fa', foreground: '#1f2028', contrast: 52 },
    dark: { accent: '#8a8fef', background: '#17171b', foreground: '#f1f1f3', contrast: 58 },
  },
  {
    id: 'midnight',
    labelKey: 'settings.appearancePresetMidnight',
    light: { accent: '#0969da', background: '#f6f8fa', foreground: '#1f2328', contrast: 55 },
    dark: { accent: '#58a6ff', background: '#0d1117', foreground: '#e6edf3', contrast: 55 },
  },
  {
    id: 'notion',
    labelKey: 'settings.appearancePresetNotion',
    light: { accent: '#2383e2', background: '#ffffff', foreground: '#37352f', contrast: 43 },
    dark: { accent: '#529cca', background: '#191919', foreground: '#f1f1ef', contrast: 50 },
  },
]

const hexPattern = /^#[0-9a-f]{6}$/i

function sanitizeModeColors(input: unknown, fallback: ModeColors): ModeColors {
  const raw = (input ?? {}) as Partial<Record<keyof ModeColors, unknown>>
  const color = (v: unknown, d: string): string =>
    typeof v === 'string' && hexPattern.test(v) ? v.toLowerCase() : d
  const contrast =
    typeof raw.contrast === 'number' && Number.isFinite(raw.contrast)
      ? Math.min(100, Math.max(0, Math.round(raw.contrast)))
      : fallback.contrast
  return {
    accent: color(raw.accent, fallback.accent),
    background: color(raw.background, fallback.background),
    foreground: color(raw.foreground, fallback.foreground),
    contrast,
  }
}

/** 宽松解析：缺失字段回落到默认值，非法值被丢弃。 */
export function sanitizeAppearance(input: unknown): AppearanceConfig {
  const raw = (input ?? {}) as Partial<Record<keyof AppearanceConfig, unknown>>
  return {
    light: sanitizeModeColors(raw.light, defaultAppearance.light),
    dark: sanitizeModeColors(raw.dark, defaultAppearance.dark),
    translucentSidebar:
      typeof raw.translucentSidebar === 'boolean'
        ? raw.translucentSidebar
        : defaultAppearance.translucentSidebar,
  }
}

function load(): AppearanceConfig {
  try {
    const raw = localStorage.getItem('skm.appearance')
    return raw ? sanitizeAppearance(JSON.parse(raw)) : structuredClone(defaultAppearance)
  } catch {
    return structuredClone(defaultAppearance)
  }
}

const appearance = ref<AppearanceConfig>(load())

watch(
  appearance,
  (v) => {
    localStorage.setItem('skm.appearance', JSON.stringify(v))
    applyAppearance(document.documentElement.classList.contains('dark'))
  },
  { deep: true },
)

function sameColors(a: ModeColors, b: ModeColors): boolean {
  return (
    a.accent === b.accent &&
    a.background === b.background &&
    a.foreground === b.foreground &&
    a.contrast === b.contrast
  )
}

/** 当前颜色匹配到的预设 id，未匹配返回 'custom'。 */
export function matchPreset(mode: 'light' | 'dark'): string {
  const current = appearance.value[mode]
  const hit = themePresets.find((p) => sameColors(p[mode], current))
  return hit ? hit.id : 'custom'
}

/** 应用一个预设（同时写入明暗两套颜色，字体与侧边栏设置保持不变）。 */
export function applyPreset(id: string): void {
  const preset = themePresets.find((p) => p.id === id)
  if (!preset) return
  appearance.value = {
    ...appearance.value,
    light: { ...preset.light },
    dark: { ...preset.dark },
  }
}

/** 根据强调色明度挑一个可读的文字颜色。 */
export function readableOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.4 ? '#171717' : '#ffffff'
}

const isMac = navigator.platform.toLowerCase().includes('mac')

/** applyAppearance 可能写入的全部 CSS 变量，应用前先统一清除。 */
const managedVars = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
]

/**
 * 把外观自定义以内联 CSS 变量写到 :root。
 * 与默认值一致的部分不写入，保证默认状态下完全走 main.css 的原始 token。
 *
 * @param dark - 当前是否处于深色模式（由 applyTheme 先行切好 .dark class）
 */
export function applyAppearance(dark: boolean): void {
  const root = document.documentElement
  const mode = dark ? 'dark' : 'light'
  const colors = appearance.value[mode]
  const base = defaultAppearance[mode]
  const vars: Record<string, string> = {}

  if (colors.accent !== base.accent) {
    vars['--primary'] = colors.accent
    vars['--primary-foreground'] = readableOn(colors.accent)
    vars['--ring'] = colors.accent
  }

  if (
    colors.background !== base.background ||
    colors.foreground !== base.foreground ||
    colors.contrast !== base.contrast
  ) {
    const { background: bg, foreground: fg } = colors
    const factor = Math.max(0.15, colors.contrast / 50)
    // 混色用 sRGB：oklch 对蓝色系前景在提亮降饱和时感知会向紫偏
    const mix = (percent: number): string =>
      `color-mix(in srgb, ${bg}, ${fg} ${Math.min(85, percent * factor).toFixed(1)}%)`
    // 各表面相对背景向前景靠拢的基准百分比（contrast=50 时与 main.css 的
    // oklch 默认值近似一致），对比度滑块整体缩放这些百分比。
    const surfaces = dark
      ? { card: 4, secondary: 10.5, muted: 8.5, accent: 11.5, border: 13 }
      : { card: 2, secondary: 4.8, muted: 3.5, accent: 5.6, border: 10.5 }
    vars['--background'] = bg
    vars['--foreground'] = fg
    vars['--card'] = mix(surfaces.card)
    vars['--card-foreground'] = fg
    vars['--popover'] = mix(surfaces.card)
    vars['--popover-foreground'] = fg
    vars['--secondary'] = mix(surfaces.secondary)
    vars['--secondary-foreground'] = fg
    vars['--muted'] = mix(surfaces.muted)
    vars['--muted-foreground'] = `color-mix(in srgb, ${bg}, ${fg} 60%)`
    vars['--accent'] = mix(surfaces.accent)
    vars['--accent-foreground'] = fg
    vars['--border'] = mix(surfaces.border)
    vars['--input'] = mix(surfaces.border)
  }

  for (const name of managedVars) root.style.removeProperty(name)
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)

  // vibrancy 材质只在 macOS 存在；关闭后侧边栏回到不透明的 muted 底色
  root.classList.toggle('vibrancy', isMac && appearance.value.translucentSidebar)
}

/** 导出当前配置（用于「复制主题」）。 */
export function exportAppearance(): string {
  return JSON.stringify(appearance.value, null, 2)
}

/**
 * 导入主题 JSON（用于「导入」），合法时合并进当前配置。
 *
 * @returns 是否导入成功
 */
export function importAppearance(json: string): boolean {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return false
    appearance.value = sanitizeAppearance({
      ...appearance.value,
      ...(parsed as Record<string, unknown>),
    })
    return true
  } catch {
    return false
  }
}

export function useAppearance() {
  return { appearance }
}
