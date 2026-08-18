<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronRight, FileText, Folder } from '@lucide/vue'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatMarketFileSize,
  type MarketTreeNode,
  type MarketTreeRow,
} from '@/lib/market-file-tree'

const props = defineProps<{
  loading: boolean
  rows: MarketTreeRow[]
  expanded: Set<string>
  fileCount: number
}>()
const emit = defineEmits<{
  toggle: [path: string]
  open: [node: MarketTreeNode]
}>()
const { t } = useI18n()
</script>

<template>
  <div v-if="props.loading" class="overflow-hidden rounded-xl border">
    <div class="border-b bg-muted/20 px-4 py-2.5">
      <Skeleton class="h-4 w-24" />
    </div>
    <div class="flex flex-col gap-1 px-4 py-2">
      <div v-for="index in 8" :key="index" class="flex items-center gap-2 py-1.5">
        <Skeleton class="size-4 shrink-0 rounded" />
        <Skeleton
          :class="[
            'h-4',
            index % 3 === 0 ? 'w-2/5' : index % 2 === 0 ? 'w-1/3' : 'w-1/4',
          ]"
        />
        <div class="flex-1" />
        <Skeleton v-if="index % 3 !== 1" class="h-3 w-12" />
      </div>
    </div>
  </div>

  <div v-else class="overflow-hidden rounded-xl border">
    <div class="border-b bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
      {{ t('market.filesCount', { n: props.fileCount }) }}
    </div>
    <ul class="py-1">
      <li v-for="row in props.rows" :key="row.node.path">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 py-1.5 pr-4 text-sm transition-colors hover:bg-accent/50"
          :style="{ paddingLeft: `${16 + row.depth * 20}px` }"
          @click="row.node.isDir ? emit('toggle', row.node.path) : emit('open', row.node)"
        >
          <component
            :is="props.expanded.has(row.node.path) ? ChevronDown : ChevronRight"
            v-if="row.node.isDir"
            class="size-3.5 shrink-0 text-muted-foreground"
          />
          <span v-else class="w-3.5 shrink-0" />
          <component
            :is="row.node.isDir ? Folder : FileText"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <span class="min-w-0 flex-1 truncate text-left">{{ row.node.name }}</span>
          <span
            v-if="!row.node.isDir"
            class="shrink-0 text-sm tabular-nums text-muted-foreground"
          >
            {{ formatMarketFileSize(row.node.size) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
