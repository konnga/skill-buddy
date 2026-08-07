<script setup lang="ts">
import { computed } from 'vue'
import { diffLines, diffWordsWithSpace } from 'diff'

const props = defineProps<{ base: string; other: string }>()

interface Segment {
  text: string
  /** word-level highlight inside a changed line */
  changed: boolean
}

interface Row {
  type: 'same' | 'add' | 'del'
  segments: Segment[]
}

/** Split a multi-line chunk into per-line segment rows. */
function toRows(type: Row['type'], text: string, segments?: Segment[]): Row[] {
  if (!segments) {
    return text
      .replace(/\n$/, '')
      .split('\n')
      .map((line) => ({ type, segments: [{ text: line, changed: false }] }))
  }
  const rows: Row[] = []
  let current: Segment[] = []
  for (const seg of segments) {
    const lines = seg.text.split('\n')
    lines.forEach((part, i) => {
      if (i > 0) {
        rows.push({ type, segments: current })
        current = []
      }
      if (part) current.push({ text: part, changed: seg.changed })
    })
  }
  rows.push({ type, segments: current })
  // trailing empty row from final newline
  if (rows.length > 1 && rows[rows.length - 1]!.segments.length === 0) rows.pop()
  return rows
}

const rows = computed<Row[]>(() => {
  const parts = diffLines(props.base, props.other)
  const out: Row[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const next = parts[i + 1]
    if (part.removed && next?.added) {
      // paired change: word-level diff between the two blocks
      const words = diffWordsWithSpace(part.value, next.value)
      const delSegs: Segment[] = []
      const addSegs: Segment[] = []
      for (const w of words) {
        if (w.added) addSegs.push({ text: w.value, changed: true })
        else if (w.removed) delSegs.push({ text: w.value, changed: true })
        else {
          delSegs.push({ text: w.value, changed: false })
          addSegs.push({ text: w.value, changed: false })
        }
      }
      out.push(...toRows('del', part.value, delSegs))
      out.push(...toRows('add', next.value, addSegs))
      i++
    } else if (part.added) {
      out.push(...toRows('add', part.value))
    } else if (part.removed) {
      out.push(...toRows('del', part.value))
    } else {
      out.push(...toRows('same', part.value))
    }
  }
  return out
})
</script>

<template>
  <div class="max-h-64 overflow-auto rounded-md border font-mono text-xs leading-5">
    <div
      v-for="(row, i) in rows"
      :key="i"
      :class="[
        'whitespace-pre-wrap px-3',
        row.type === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        row.type === 'del' && 'bg-red-500/[0.07] text-red-700 dark:text-red-400',
      ]"
    >
      <span class="mr-2 select-none opacity-60">{{
        row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '
      }}</span
      ><template v-for="(seg, j) in row.segments" :key="j"
        ><span
          :class="
            seg.changed
              ? row.type === 'add'
                ? 'rounded-[3px] bg-emerald-500/25'
                : 'rounded-[3px] bg-red-500/20'
              : ''
          "
          >{{ seg.text }}</span
        ></template
      >
    </div>
  </div>
</template>
