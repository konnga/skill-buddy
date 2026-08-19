<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MarkdownView from '@/components/AsyncMarkdownView.vue'
import { Skeleton } from '@/components/ui/skeleton'

const props = defineProps<{
  loading: boolean
  content: string | null
}>()
const { t } = useI18n()
</script>

<template>
  <section>
    <div v-if="props.loading" class="flex flex-col gap-3 py-2">
      <Skeleton class="h-6 w-1/3" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-5/6" />
      <Skeleton class="mt-3 h-5 w-1/4" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-4/5" />
      <Skeleton class="mt-3 h-32 w-full rounded-lg" />
    </div>
    <MarkdownView
      v-else-if="props.content"
      :content="props.content"
      preview-id="market-overview"
      class="select-text"
    />
    <p v-else class="py-8 text-center text-sm text-muted-foreground">
      {{ t('market.overviewUnavailable') }}
    </p>
  </section>
</template>
