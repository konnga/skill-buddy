<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { basicSetup, EditorView } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'

const model = defineModel<string>({ default: '' })
const props = withDefaults(defineProps<{ height?: string }>(), { height: '420px' })
const host = ref<HTMLElement>()
let view: EditorView | undefined

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: model.value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) model.value = update.state.doc.toString()
        }),
      ],
    }),
  })
})

onBeforeUnmount(() => view?.destroy())

watch(model, (value) => {
  if (view && value !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }
})

/** 容器尺寸变化后重新测量编辑器，并恢复输入焦点。 */
function focus(): void {
  view?.requestMeasure()
  view?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div ref="host" class="cm-host overflow-hidden rounded-md border" :style="{ height: props.height }" />
</template>

<style>
.cm-host .cm-editor {
  height: 100%;
  font-size: 13px;
  background: var(--background);
  color: var(--foreground);
}
.cm-host .cm-scroller {
  overflow: auto;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  scrollbar-width: thin;
}
.cm-host .cm-scroller::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.cm-host .cm-scroller::-webkit-scrollbar-track {
  background: transparent;
}
.cm-host .cm-scroller::-webkit-scrollbar-thumb {
  min-height: 24px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--scrollbar-thumb);
  background-clip: padding-box;
}
.cm-host .cm-scroller::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
  background-clip: padding-box;
}
.cm-host .cm-editor.cm-focused {
  outline: none;
}
.cm-host .cm-gutters {
  background: var(--muted);
  color: var(--muted-foreground);
  border-right: 1px solid var(--border);
}
.cm-host .cm-activeLine {
  background: color-mix(in oklch, var(--accent) 55%, transparent);
}
.cm-host .cm-activeLineGutter {
  background: var(--accent);
}
.cm-host .cm-content {
  caret-color: var(--foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-height: 100%;
}
.cm-host .cm-cursor {
  border-left-color: var(--foreground);
}
.cm-host .cm-selectionBackground,
.cm-host .cm-editor ::selection {
  background: color-mix(in oklch, var(--foreground) 15%, transparent) !important;
}
</style>
