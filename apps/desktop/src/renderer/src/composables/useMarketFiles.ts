import {
  computed,
  onBeforeUnmount,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import type { FoundSkill } from '@skillbuddy/core'
import {
  buildMarketFileTree,
  flattenMarketFileTree,
  isMarketBinaryFile,
  type MarketTreeEntry,
  type MarketTreeNode,
} from '@/lib/market-file-tree'

interface UseMarketFilesOptions {
  active: MaybeRefOrGetter<boolean>
  matched: MaybeRefOrGetter<FoundSkill | null>
}

export interface MarketOpenedFile {
  path: string
  size: number
}

export function useMarketFiles(options: UseMarketFilesOptions) {
  const active = computed(() => toValue(options.active))
  const matched = computed(() => toValue(options.matched))
  const sourceDir = computed(() => matched.value?.dir ?? null)
  const treeEntries = shallowRef<MarketTreeEntry[] | null>(null)
  const treeLoading = shallowRef(false)
  const expanded = shallowRef(new Set<string>())
  const openedFile = shallowRef<MarketOpenedFile | null>(null)
  const fileContent = shallowRef<string | null>(null)
  const fileTruncated = shallowRef(false)
  const fileLoading = shallowRef(false)
  let loadedDir: string | null = null
  let observedDir = sourceDir.value
  let treeRequestId = 0
  let fileRequestId = 0

  const fileCount = computed(
    () => treeEntries.value?.filter((entry) => !entry.isDir).length ?? 0,
  )
  const tree = computed(() => buildMarketFileTree(treeEntries.value ?? []))
  const visibleRows = computed(() => flattenMarketFileTree(tree.value, expanded.value))
  const openedIsMarkdown = computed(
    () => openedFile.value?.path.toLowerCase().endsWith('.md') ?? false,
  )
  const openedIsBinary = computed(() =>
    openedFile.value ? isMarketBinaryFile(openedFile.value.path) : false,
  )

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

  /** 文件标签首次激活时读取目录，并丢弃条目切换后的过期响应。 */
  async function loadTree(): Promise<void> {
    const dir = sourceDir.value
    if (!active.value || !dir || treeLoading.value || loadedDir === dir) return
    const requestId = ++treeRequestId
    treeLoading.value = true
    try {
      const result = await window.skillsManager.listTree(dir)
      if (requestId !== treeRequestId || sourceDir.value !== dir) return
      treeEntries.value = result
      loadedDir = dir
    } catch {
      if (requestId !== treeRequestId || sourceDir.value !== dir) return
      treeEntries.value = []
      loadedDir = dir
    } finally {
      if (requestId === treeRequestId) treeLoading.value = false
    }
  }

  function toggleDirectory(path: string): void {
    const next = new Set(expanded.value)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    expanded.value = next
  }

  async function openFile(node: MarketTreeNode): Promise<void> {
    if (node.isDir) return
    const dir = sourceDir.value
    const requestId = ++fileRequestId
    fileLoading.value = false
    openedFile.value = { path: node.path, size: node.size }
    fileContent.value = null
    fileTruncated.value = false
    if (isMarketBinaryFile(node.path) || !dir) return
    fileLoading.value = true
    try {
      const result = await window.skillsManager.readFile(`${dir}/${node.path}`)
      if (
        requestId !== fileRequestId ||
        sourceDir.value !== dir ||
        openedFile.value?.path !== node.path
      ) return
      fileContent.value = result.content
      fileTruncated.value = result.truncated
    } catch {
      if (requestId === fileRequestId && sourceDir.value === dir) fileContent.value = null
    } finally {
      if (requestId === fileRequestId) fileLoading.value = false
    }
  }

  function closeFile(): void {
    fileRequestId += 1
    fileLoading.value = false
    openedFile.value = null
    fileContent.value = null
    fileTruncated.value = false
  }

  watch(
    [active, sourceDir],
    ([isActive, dir]) => {
      if (dir !== observedDir) {
        observedDir = dir
        resetFiles()
      }
      if (isActive) void loadTree()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    treeRequestId += 1
    fileRequestId += 1
  })

  return {
    treeEntries,
    treeLoading,
    expanded,
    openedFile,
    fileContent,
    fileTruncated,
    fileLoading,
    fileCount,
    visibleRows,
    openedIsMarkdown,
    openedIsBinary,
    toggleDirectory,
    openFile,
    closeFile,
  }
}
