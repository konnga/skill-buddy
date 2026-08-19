<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  FolderOpen,
} from '@lucide/vue'
import {
  buildSkillResourceTree,
  flattenSkillResourceTree,
  type SkillResourceEntry,
  type SkillResourceTreeNode,
} from '@/lib/skill-resource-tree'

const props = defineProps<{
  resources: SkillResourceEntry[]
}>()
const emit = defineEmits<{
  preview: [path: string, source: string]
}>()

const { t } = useI18n()
const tree = computed(() => buildSkillResourceTree(props.resources))
const expanded = shallowRef<ReadonlySet<string>>(new Set())
const rows = computed(() => flattenSkillResourceTree(tree.value, expanded.value))

watch(tree, () => {
  expanded.value = new Set()
})

function toggleDirectory(path: string): void {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

function activateNode(node: SkillResourceTreeNode): void {
  if (node.kind === 'directory') {
    toggleDirectory(node.path)
    return
  }
  if (node.source !== null) emit('preview', node.path, node.source)
}

function nodeLabel(node: SkillResourceTreeNode): string {
  if (node.kind === 'file') return t('detail.previewResource', { name: node.path })
  const messageKey = expanded.value.has(node.path)
    ? 'detail.collapseDirectory'
    : 'detail.expandDirectory'
  return t(messageKey, { name: node.path })
}
</script>

<template>
  <ul
    role="tree"
    :aria-label="t('detail.resources')"
    class="overflow-hidden rounded-md border py-1"
  >
    <li v-for="row in rows" :key="row.node.path" role="none">
      <button
        type="button"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-expanded="
          row.node.kind === 'directory' ? expanded.has(row.node.path) : undefined
        "
        :aria-label="nodeLabel(row.node)"
        :title="row.node.path"
        class="group flex h-9 w-full cursor-pointer items-center gap-2 pr-3 text-left transition-colors hover:bg-muted/40"
        :style="{ paddingLeft: `${12 + row.depth * 20}px` }"
        @click="activateNode(row.node)"
      >
        <component
          :is="expanded.has(row.node.path) ? ChevronDown : ChevronRight"
          v-if="row.node.kind === 'directory'"
          class="size-3.5 shrink-0 text-muted-foreground"
        />
        <span v-else class="w-3.5 shrink-0" />
        <component
          :is="
            row.node.kind === 'directory'
              ? expanded.has(row.node.path)
                ? FolderOpen
                : Folder
              : FileText
          "
          class="size-4 shrink-0 text-muted-foreground"
        />
        <code class="min-w-0 flex-1 select-text truncate text-sm">{{ row.node.name }}</code>
        <Eye
          v-if="row.node.kind === 'file'"
          class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      </button>
    </li>
  </ul>
</template>
