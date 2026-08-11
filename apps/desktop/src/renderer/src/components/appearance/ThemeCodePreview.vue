<script setup lang="ts">
import { computed } from 'vue'
import {
  defaultAppearance,
  useAppearance,
  type ModeColors,
} from '@/composables/useAppearance'

/**
 * 仿 ChatGPT 桌面端的主题代码预览：左侧为默认值、右侧为当前自定义值，
 * 以 diff 高亮标出被修改的字段，同时整块用当前背景 / 前景 / 代码字体渲染，
 * 兼作主题的实时预览。
 */
const props = defineProps<{ mode: 'light' | 'dark' }>()

const { appearance } = useAppearance()

const current = computed(() => appearance.value[props.mode])
const base = computed(() => defaultAppearance[props.mode])

interface Segment {
  text: string
  color?: string
}
interface Row {
  no: number
  segments: Segment[]
  changed: boolean
}

/** 语法配色按预览底色的明暗选择，保证在自定义背景上仍可读。 */
const syn = computed(() =>
  props.mode === 'dark'
    ? { keyword: '#c084fc', type: '#a5b4fc', prop: '#7dd3fc', str: '#6ee7b7', num: '#93c5fd' }
    : { keyword: '#7c3aed', type: '#4f46e5', prop: '#0369a1', str: '#047857', num: '#1d4ed8' },
)

const changedFields = computed(() => ({
  accent: current.value.accent !== base.value.accent,
  background: current.value.background !== base.value.background,
  foreground: current.value.foreground !== base.value.foreground,
  contrast: current.value.contrast !== base.value.contrast,
}))

function buildRows(colors: ModeColors): Row[] {
  const s = syn.value
  const changed = changedFields.value
  const field = (name: keyof typeof changed, value: string, quoted: boolean): Row => ({
    no: 0,
    changed: changed[name],
    segments: [
      { text: `  ${name}`, color: s.prop },
      { text: ': ' },
      { text: quoted ? `"${value}"` : value, color: quoted ? s.str : s.num },
      { text: ',' },
    ],
  })
  const rows: Row[] = [
    {
      no: 0,
      changed: false,
      segments: [
        { text: 'const', color: s.keyword },
        { text: ' themePreview' },
        { text: ': ' },
        { text: 'ThemeConfig', color: s.type },
        { text: ' = {' },
      ],
    },
    field('accent', colors.accent, true),
    field('background', colors.background, true),
    field('foreground', colors.foreground, true),
    field('contrast', String(colors.contrast), false),
    { no: 0, changed: false, segments: [{ text: '};' }] },
  ]
  return rows.map((row, i) => ({ ...row, no: i + 1 }))
}

const oldRows = computed(() => buildRows(base.value))
const newRows = computed(() => buildRows(current.value))

const previewStyle = computed(() => ({
  background: `color-mix(in srgb, ${current.value.background}, ${current.value.foreground} 3.5%)`,
  color: `color-mix(in srgb, ${current.value.foreground}, ${current.value.background} 8%)`,
  fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace",
}))

const panes = computed(() => [
  {
    kind: 'old' as const,
    rows: oldRows.value,
    bar: '#f85149',
    tint: 'rgb(248 81 73 / 0.13)',
    gutter: '#f8514999',
  },
  {
    kind: 'new' as const,
    rows: newRows.value,
    bar: '#3fb950',
    tint: 'rgb(63 185 80 / 0.13)',
    gutter: '#3fb95099',
  },
])
</script>

<template>
  <div class="overflow-x-auto rounded-xl border" :style="previewStyle">
    <div class="grid min-w-[540px] grid-cols-2 py-2 text-xs leading-6">
      <div
        v-for="pane in panes"
        :key="pane.kind"
        :class="pane.kind === 'old' ? 'border-r border-black/20 dark:border-white/10' : ''"
      >
        <div
          v-for="row in pane.rows"
          :key="row.no"
          class="relative flex items-stretch whitespace-pre"
          :style="row.changed ? { background: pane.tint } : undefined"
        >
          <span
            class="w-[3px] flex-none self-stretch"
            :style="row.changed ? { background: pane.bar } : undefined"
          />
          <span
            class="w-9 flex-none select-none pr-3 text-right opacity-45"
            :style="row.changed ? { color: pane.gutter, opacity: 1 } : undefined"
          >
            {{ row.no }}
          </span>
          <span class="pr-4">
            <span
              v-for="(seg, i) in row.segments"
              :key="i"
              :style="seg.color ? { color: seg.color } : undefined"
            >{{ seg.text }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
