<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{ content: string; previewId?: string }>()

const MdPreview = defineAsyncComponent(async () => {
  const [{ config: configureMarkdown, MdPreview: Preview }, { default: hljs }] = await Promise.all([
    import('md-editor-v3'),
    import('@/lib/highlight'),
    import('md-editor-v3/lib/preview.css'),
  ])
  configureMarkdown({
    editorExtensions: {
      highlight: {
        instance: hljs,
      },
    },
  })
  return Preview
})

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
.markdown-view :deep(.hljs) {
  color: #24292f;
  background: transparent;
}
.markdown-view :deep(.hljs-comment),
.markdown-view :deep(.hljs-quote) {
  color: #6e7781;
}
.markdown-view :deep(.hljs-keyword),
.markdown-view :deep(.hljs-selector-tag),
.markdown-view :deep(.hljs-subst),
.markdown-view :deep(.hljs-literal) {
  color: #cf222e;
}
.markdown-view :deep(.hljs-number),
.markdown-view :deep(.hljs-variable),
.markdown-view :deep(.hljs-template-variable),
.markdown-view :deep(.hljs-tag .hljs-attr) {
  color: #0550ae;
}
.markdown-view :deep(.hljs-string),
.markdown-view :deep(.hljs-doctag),
.markdown-view :deep(.hljs-regexp) {
  color: #0a3069;
}
.markdown-view :deep(.hljs-title),
.markdown-view :deep(.hljs-section),
.markdown-view :deep(.hljs-selector-id),
.markdown-view :deep(.hljs-selector-class) {
  color: #8250df;
}
.markdown-view :deep(.hljs-type),
.markdown-view :deep(.hljs-class .hljs-title) {
  color: #953800;
}
.markdown-view :deep(.hljs-tag),
.markdown-view :deep(.hljs-name),
.markdown-view :deep(.hljs-attribute) {
  color: #116329;
}
.markdown-view :deep(.hljs-built_in),
.markdown-view :deep(.hljs-symbol),
.markdown-view :deep(.hljs-bullet),
.markdown-view :deep(.hljs-link),
.markdown-view :deep(.hljs-meta),
.markdown-view :deep(.hljs-selector-attr),
.markdown-view :deep(.hljs-selector-pseudo) {
  color: #0550ae;
}
.markdown-view :deep(.hljs-addition) {
  color: #116329;
  background: #dafbe1;
}
.markdown-view :deep(.hljs-deletion) {
  color: #cf222e;
  background: #ffebe9;
}
.markdown-view :deep(.hljs-emphasis) {
  font-style: italic;
}
.markdown-view :deep(.hljs-strong) {
  font-weight: 700;
}
:global(.dark) .markdown-view :deep(.hljs) {
  color: #e6edf3;
}
:global(.dark) .markdown-view :deep(.hljs-comment),
:global(.dark) .markdown-view :deep(.hljs-quote) {
  color: #8b949e;
}
:global(.dark) .markdown-view :deep(.hljs-keyword),
:global(.dark) .markdown-view :deep(.hljs-selector-tag),
:global(.dark) .markdown-view :deep(.hljs-subst),
:global(.dark) .markdown-view :deep(.hljs-literal) {
  color: #ff7b72;
}
:global(.dark) .markdown-view :deep(.hljs-number),
:global(.dark) .markdown-view :deep(.hljs-variable),
:global(.dark) .markdown-view :deep(.hljs-template-variable),
:global(.dark) .markdown-view :deep(.hljs-tag .hljs-attr) {
  color: #79c0ff;
}
:global(.dark) .markdown-view :deep(.hljs-string),
:global(.dark) .markdown-view :deep(.hljs-doctag),
:global(.dark) .markdown-view :deep(.hljs-regexp) {
  color: #a5d6ff;
}
:global(.dark) .markdown-view :deep(.hljs-title),
:global(.dark) .markdown-view :deep(.hljs-section),
:global(.dark) .markdown-view :deep(.hljs-selector-id),
:global(.dark) .markdown-view :deep(.hljs-selector-class) {
  color: #d2a8ff;
}
:global(.dark) .markdown-view :deep(.hljs-type),
:global(.dark) .markdown-view :deep(.hljs-class .hljs-title) {
  color: #ffa657;
}
:global(.dark) .markdown-view :deep(.hljs-tag),
:global(.dark) .markdown-view :deep(.hljs-name),
:global(.dark) .markdown-view :deep(.hljs-attribute),
:global(.dark) .markdown-view :deep(.hljs-built_in),
:global(.dark) .markdown-view :deep(.hljs-symbol),
:global(.dark) .markdown-view :deep(.hljs-bullet),
:global(.dark) .markdown-view :deep(.hljs-link),
:global(.dark) .markdown-view :deep(.hljs-meta),
:global(.dark) .markdown-view :deep(.hljs-selector-attr),
:global(.dark) .markdown-view :deep(.hljs-selector-pseudo) {
  color: #7ee787;
}
:global(.dark) .markdown-view :deep(.hljs-addition) {
  color: #aff5b4;
  background: #033a16;
}
:global(.dark) .markdown-view :deep(.hljs-deletion) {
  color: #ffa198;
  background: #490202;
}
</style>
