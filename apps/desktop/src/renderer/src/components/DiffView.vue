<script setup lang="ts">
import { computed } from 'vue'
import { diffLines } from 'diff'

const props = defineProps<{ base: string; other: string }>()

interface Row {
  type: 'same' | 'add' | 'del'
  text: string
}

const rows = computed<Row[]>(() => {
  const parts = diffLines(props.base, props.other)
  const out: Row[] = []
  for (const part of parts) {
    const type: Row['type'] = part.added ? 'add' : part.removed ? 'del' : 'same'
    for (const line of part.value.replace(/\n$/, '').split('\n')) {
      out.push({ type, text: line })
    }
  }
  return out
})
</script>

<template>
  <div
    class="max-h-64 overflow-auto rounded-md border font-mono text-xs leading-5"
  >
    <div
      v-for="(row, i) in rows"
      :key="i"
      :class="[
        'whitespace-pre-wrap px-3',
        row.type === 'add' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        row.type === 'del' && 'bg-red-500/10 text-red-700 line-through/25 dark:text-red-400',
      ]"
    >
      <span class="mr-2 select-none opacity-60">{{
        row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '
      }}</span>{{ row.text }}
    </div>
  </div>
</template>
