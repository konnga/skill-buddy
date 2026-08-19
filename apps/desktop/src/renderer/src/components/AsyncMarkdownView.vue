<script setup lang="ts">
import { defineAsyncComponent, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  content: string
  previewId?: string
}>()
const attrs = useAttrs()

const MarkdownView = defineAsyncComponent(() => import('./MarkdownView.vue'))
</script>

<template>
  <MarkdownView
    :content="props.content"
    :preview-id="props.previewId"
    v-bind="attrs"
  />
</template>
