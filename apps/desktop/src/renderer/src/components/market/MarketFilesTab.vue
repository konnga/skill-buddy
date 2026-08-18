<script setup lang="ts">
import type { FoundSkill } from '@skillbuddy/core'
import MarketFilePreview from '@/components/market/MarketFilePreview.vue'
import MarketFileTree from '@/components/market/MarketFileTree.vue'
import { useMarketFiles } from '@/composables/useMarketFiles'

const props = defineProps<{
  active: boolean
  matched: FoundSkill | null
  sourceLoading: boolean
}>()

const {
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
} = useMarketFiles({
  active: () => props.active,
  matched: () => props.matched,
})
</script>

<template>
  <section>
    <MarketFilePreview
      v-if="openedFile"
      :file="openedFile"
      :content="fileContent"
      :loading="fileLoading"
      :truncated="fileTruncated"
      :markdown="openedIsMarkdown"
      :binary="openedIsBinary"
      @close="closeFile"
    />
    <MarketFileTree
      v-else
      :loading="treeLoading || (props.sourceLoading && treeEntries === null)"
      :rows="visibleRows"
      :expanded="expanded"
      :file-count="fileCount"
      @toggle="toggleDirectory"
      @open="openFile"
    />
  </section>
</template>
