<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder } from '@lucide/vue'
import type { FoundSkill } from '@skillbuddy/core'
import MarkdownView from '@/components/MarkdownView.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'

interface TreeEntry {
  path: string
  size: number
  isDir: boolean
}

interface TreeNode extends TreeEntry {
  name: string
  children: TreeNode[]
}

const props = defineProps<{
  active: boolean
  matched: FoundSkill | null
  sourceLoading: boolean
}>()

const { t } = useI18n()
const treeEntries = ref<TreeEntry[] | null>(null)
const treeLoading = shallowRef(false)
const expanded = ref<Set<string>>(new Set())
const openedFile = shallowRef<{ path: string; size: number } | null>(null)
const fileContent = shallowRef<string | null>(null)
const fileTruncated = shallowRef(false)
const fileLoading = shallowRef(false)
let loadedDir: string | null = null
let observedDir = props.matched?.dir ?? null
let treeRequestId = 0
let fileRequestId = 0

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'icns', 'bmp',
  'zip', 'gz', 'tar', 'bz2', '7z', 'pdf',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'wasm', 'node', 'dylib', 'so', 'dll',
])

const fileCount = computed(() =>
  (treeEntries.value ?? []).filter((entry) => !entry.isDir).length,
)
const tree = computed<TreeNode[]>(() => {
  const root: TreeNode[] = []
  const byPath = new Map<string, TreeNode>()
  for (const entry of treeEntries.value ?? []) {
    const node: TreeNode = {
      ...entry,
      name: entry.path.split('/').pop()!,
      children: [],
    }
    byPath.set(entry.path, node)
    const slash = entry.path.lastIndexOf('/')
    const parent = slash > 0 ? byPath.get(entry.path.slice(0, slash)) : undefined
    ;(parent ? parent.children : root).push(node)
  }
  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((left, right) =>
      left.isDir === right.isDir
        ? left.name.localeCompare(right.name)
        : left.isDir
          ? -1
          : 1,
    )
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(root)
  return root
})
const visibleRows = computed(() => {
  const rows: { node: TreeNode; depth: number }[] = []
  const walk = (nodes: TreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth })
      if (node.isDir && expanded.value.has(node.path)) walk(node.children, depth + 1)
    }
  }
  walk(tree.value, 0)
  return rows
})
const openedIsMarkdown = computed(
  () => openedFile.value?.path.toLowerCase().endsWith('.md') ?? false,
)
const openedIsBinary = computed(() => {
  const extension = openedFile.value?.path.split('.').pop()?.toLowerCase()
  return extension ? BINARY_EXT.has(extension) : false
})

function resetFiles(): void {
  treeRequestId += 1
  fileRequestId += 1
  treeLoading.value = false
  fileLoading.value = false
  treeEntries.value = null
  expanded.value = new Set()
  openedFile.value = null
  fileContent.value = null
  fileTruncated.value = false
  loadedDir = null
}

/** 仅在文件标签首次激活时读取目录，并忽略市场条目切换后的过期结果。 */
async function loadTree(): Promise<void> {
  const dir = props.matched?.dir
  if (!props.active || !dir || treeLoading.value || loadedDir === dir) return
  const currentRequestId = ++treeRequestId
  treeLoading.value = true
  try {
    const result = await window.skillsManager.listTree(dir)
    if (treeRequestId !== currentRequestId || props.matched?.dir !== dir) return
    treeEntries.value = result
    loadedDir = dir
  } catch {
    if (treeRequestId !== currentRequestId || props.matched?.dir !== dir) return
    treeEntries.value = []
    loadedDir = dir
  } finally {
    if (treeRequestId === currentRequestId) treeLoading.value = false
  }
}

function toggleDir(path: string): void {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

async function openFile(node: TreeNode): Promise<void> {
  const dir = props.matched?.dir
  const currentRequestId = ++fileRequestId
  fileLoading.value = false
  openedFile.value = { path: node.path, size: node.size }
  fileContent.value = null
  fileTruncated.value = false
  if (openedIsBinary.value || !dir) return
  fileLoading.value = true
  try {
    const result = await window.skillsManager.readFile(`${dir}/${node.path}`)
    if (
      fileRequestId !== currentRequestId ||
      props.matched?.dir !== dir ||
      openedFile.value?.path !== node.path
    ) return
    fileContent.value = result.content
    fileTruncated.value = result.truncated
  } catch {
    if (fileRequestId === currentRequestId && props.matched?.dir === dir) {
      fileContent.value = null
    }
  } finally {
    if (fileRequestId === currentRequestId) fileLoading.value = false
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

watch(
  [() => props.active, () => props.matched?.dir ?? null],
  ([active, dir]) => {
    if (dir !== observedDir) {
      observedDir = dir
      resetFiles()
    }
    if (active) void loadTree()
  },
  { immediate: true },
)
</script>

<template>
  <section>
    <div
      v-if="treeLoading || (props.sourceLoading && !treeEntries)"
      class="overflow-hidden rounded-xl border"
    >
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

    <div v-else-if="openedFile" class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          class="cursor-pointer"
          @click="openedFile = null"
        >
          <ArrowLeft class="size-3.5" />
          {{ t('market.backToFiles') }}
        </Button>
        <span class="min-w-0 truncate text-sm font-medium">{{ openedFile.path }}</span>
        <span class="shrink-0 text-sm tabular-nums text-muted-foreground">
          {{ formatSize(openedFile.size) }}
        </span>
      </div>
      <p
        v-if="fileTruncated"
        class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400"
      >
        {{ t('market.fileTruncated') }}
      </p>
      <div v-if="fileLoading" class="flex flex-col gap-2.5 py-2">
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-11/12" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-4 w-5/6" />
      </div>
      <p
        v-else-if="openedIsBinary || fileContent === null"
        class="py-8 text-center text-sm text-muted-foreground"
      >
        {{ t('market.previewUnsupported') }}
      </p>
      <MarkdownView
        v-else-if="openedIsMarkdown"
        :content="fileContent"
        preview-id="market-file"
        class="select-text"
      />
      <ScrollArea
        v-else
        orientation="both"
        class="max-h-[32rem] rounded-lg border bg-muted/30"
        viewport-class="max-h-[32rem]"
      >
        <pre class="select-text px-4 py-3 text-sm leading-relaxed">{{ fileContent }}</pre>
      </ScrollArea>
    </div>

    <div v-else class="overflow-hidden rounded-xl border">
      <div class="border-b bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
        {{ t('market.filesCount', { n: fileCount }) }}
      </div>
      <ul class="py-1">
        <li v-for="row in visibleRows" :key="row.node.path">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 py-1.5 pr-4 text-sm transition-colors hover:bg-accent/50"
            :style="{ paddingLeft: `${16 + row.depth * 20}px` }"
            @click="row.node.isDir ? toggleDir(row.node.path) : openFile(row.node)"
          >
            <component
              :is="expanded.has(row.node.path) ? ChevronDown : ChevronRight"
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
              {{ formatSize(row.node.size) }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
