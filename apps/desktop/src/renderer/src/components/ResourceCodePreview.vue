<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import hljs from '@/lib/highlight'

const props = withDefaults(
  defineProps<{
    content: string
    path: string
    highlight?: boolean
  }>(),
  { highlight: true },
)

const codeElement = useTemplateRef<HTMLElement>('codeElement')
const languageByExtension: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  css: 'css',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  html: 'xml',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

const highlightClassRules = [
  {
    selector: '.hljs-comment, .hljs-quote',
    classes: ['text-muted-foreground'],
  },
  {
    selector: '.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-section, .hljs-link',
    classes: ['text-red-700', 'dark:text-red-400'],
  },
  {
    selector:
      '.hljs-string, .hljs-title, .hljs-name, .hljs-type, .hljs-attribute, .hljs-symbol, .hljs-bullet, .hljs-addition, .hljs-variable, .hljs-template-tag, .hljs-template-variable',
    classes: ['text-blue-800', 'dark:text-blue-300'],
  },
  {
    selector: '.hljs-number, .hljs-meta, .hljs-built_in, .hljs-builtin-name, .hljs-params',
    classes: ['text-blue-700', 'dark:text-blue-400'],
  },
  {
    selector: '.hljs-attr, .hljs-property',
    classes: ['text-amber-800', 'dark:text-amber-300'],
  },
  {
    selector: '.hljs-deletion',
    classes: ['bg-red-100', 'text-red-900', 'dark:bg-red-950', 'dark:text-red-200'],
  },
]

const language = computed(() => {
  const extension = props.path.split('.').pop()?.toLowerCase() ?? ''
  return languageByExtension[extension]
})
/** 文件末尾的换行符不展示，避免出现一个多余的空行号。 */
const displayContent = computed(() => props.content.replace(/\r?\n$/, ''))
const lineNumbers = computed(() =>
  Array.from(
    { length: Math.max(1, displayContent.value.split('\n').length) },
    (_, index) => index + 1,
  ),
)

function renderHighlight(): void {
  const element = codeElement.value
  if (!element) return
  element.removeAttribute('data-highlighted')
  element.className = props.highlight && language.value ? `language-${language.value}` : ''
  element.textContent = displayContent.value
  if (!props.highlight) return
  hljs.highlightElement(element)
  for (const rule of highlightClassRules) {
    for (const token of element.querySelectorAll(rule.selector)) {
      token.classList.add(...rule.classes)
    }
  }
}

onMounted(renderHighlight)
watch(
  () => [props.content, props.path, props.highlight],
  () => void nextTick(renderHighlight),
)
</script>

<template>
  <!-- flex-1 配合外层视口的 flex 列布局，让行号列的底色与分隔线贴满整个可视区 -->
  <div class="flex min-w-max flex-1 font-mono text-sm leading-6">
    <div
      aria-hidden="true"
      class="select-none border-r bg-muted/25 px-3 py-5 text-right tabular-nums text-muted-foreground"
    >
      <span v-for="line in lineNumbers" :key="line" class="block">{{ line }}</span>
    </div>
    <pre class="resource-code-preview min-w-0 flex-1 select-text p-5"><code ref="codeElement" /></pre>
  </div>
</template>
