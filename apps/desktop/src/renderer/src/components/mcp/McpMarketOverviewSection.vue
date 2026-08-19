<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MarkdownView from '@/components/AsyncMarkdownView.vue'

const props = defineProps<{ overview: string }>()
const { t } = useI18n()
</script>

<template>
  <section class="rounded-lg border p-5">
    <h2 class="text-base font-semibold">{{ t('mcp.market.overview') }}</h2>
    <div v-if="props.overview" class="mt-4">
      <MarkdownView :content="props.overview" preview-id="mcp-market-overview" />
    </div>
    <p v-else class="mt-4 text-sm text-muted-foreground">
      {{ t('mcp.market.overviewEmpty') }}
    </p>
  </section>
</template>
