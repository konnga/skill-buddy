<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'

const props = defineProps<{ content: string; previewId?: string }>()

/* follow the app's class-based dark mode (toggled on <html> by applyTheme) */
const dark = ref(document.documentElement.classList.contains('dark'))
let observer: MutationObserver | undefined

onMounted(() => {
  observer = new MutationObserver(() => {
    dark.value = document.documentElement.classList.contains('dark')
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onUnmounted(() => observer?.disconnect())

const id = computed(() => props.previewId ?? 'md-view')
</script>

<template>
  <MdPreview
    :id="id"
    :model-value="content"
    :theme="dark ? 'dark' : 'light'"
    preview-theme="github"
    code-theme="github"
    :show-code-row-number="false"
    class="markdown-view"
  />
</template>

<style scoped>
/* blend the preview into the app surface instead of its own page background */
.markdown-view {
  --md-bk-color: transparent;
  font-size: 14px;
}
.markdown-view :deep(.md-editor-preview-wrapper) {
  padding: 0;
}
.markdown-view :deep(.github-theme) {
  font-size: 14px;
}
</style>
