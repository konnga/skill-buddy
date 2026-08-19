<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@lucide/vue'
import MarkdownView from '@/components/AsyncMarkdownView.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketOpenedFile } from '@/composables/useMarketFiles'
import { formatMarketFileSize } from '@/lib/market-file-tree'

const props = defineProps<{
  file: MarketOpenedFile
  content: string | null
  loading: boolean
  truncated: boolean
  markdown: boolean
  binary: boolean
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('close')">
        <ArrowLeft class="size-3.5" />
        {{ t('market.backToFiles') }}
      </Button>
      <span class="min-w-0 truncate text-sm font-medium">{{ props.file.path }}</span>
      <span class="shrink-0 text-sm tabular-nums text-muted-foreground">
        {{ formatMarketFileSize(props.file.size) }}
      </span>
    </div>
    <p
      v-if="props.truncated"
      class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400"
    >
      {{ t('market.fileTruncated') }}
    </p>
    <div v-if="props.loading" class="flex flex-col gap-2.5 py-2">
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-11/12" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-3/4" />
      <Skeleton class="h-4 w-5/6" />
    </div>
    <p
      v-else-if="props.binary || props.content === null"
      class="py-8 text-center text-sm text-muted-foreground"
    >
      {{ t('market.previewUnsupported') }}
    </p>
    <MarkdownView
      v-else-if="props.markdown"
      :content="props.content"
      preview-id="market-file"
      class="select-text"
    />
    <ScrollArea
      v-else
      orientation="both"
      class="max-h-[32rem] rounded-lg border bg-muted/30"
      viewport-class="max-h-[32rem]"
    >
      <pre class="select-text px-4 py-3 text-sm leading-relaxed">{{ props.content }}</pre>
    </ScrollArea>
  </div>
</template>
