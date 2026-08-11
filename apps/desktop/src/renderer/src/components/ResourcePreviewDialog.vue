<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { AlertCircle, Code2, Eye, FileText, Image as ImageIcon, X } from '@lucide/vue'
import type { FilePreviewResult } from '../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import ResourceCodePreview from '@/components/ResourceCodePreview.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'

interface ResourcePreviewTarget {
  path: string
  source: string
}

const props = defineProps<{ resource: ResourcePreviewTarget | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const preview = shallowRef<FilePreviewResult | null>(null)
const loading = shallowRef(false)
const error = shallowRef(false)
const viewMode = shallowRef<'preview' | 'source'>('preview')
const isMarkdown = computed(() => props.resource?.path.toLowerCase().endsWith('.md') ?? false)
const isImage = computed(() => preview.value?.kind === 'image')
const sourceAvailable = computed(() => preview.value?.kind === 'text')

watch(
  () => props.resource,
  async (resource, _previous, onCleanup) => {
    preview.value = null
    error.value = false
    loading.value = false
    viewMode.value = 'preview'
    if (!resource) return

    let active = true
    onCleanup(() => {
      active = false
    })
    loading.value = true
    try {
      const result = await window.skillsManager.previewFile(resource.source)
      if (active) preview.value = result
    } catch {
      if (active) error.value = true
    } finally {
      if (active) loading.value = false
    }
  },
  { immediate: true },
)

const unsupportedMessage = computed(() =>
  preview.value?.kind === 'unsupported' && preview.value.reason === 'too-large'
    ? t('detail.resourcePreviewTooLarge')
    : t('detail.resourcePreviewUnsupported'),
)

function handleOpenChange(open: boolean): void {
  if (!open) emit('close')
}

function setViewMode(mode: 'preview' | 'source'): void {
  if (mode === 'source' && !sourceAvailable.value) return
  viewMode.value = mode
}
</script>

<template>
  <DialogRoot :open="resource !== null" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/45" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(760px,86vh)] w-[min(900px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <header class="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <component
            :is="isImage ? ImageIcon : FileText"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <DialogTitle class="min-w-0 flex-1 truncate font-mono text-sm font-medium">
            {{ resource?.path }}
          </DialogTitle>
          <div
            role="group"
            :aria-label="t('detail.resourceViewMode')"
            class="flex h-8 shrink-0 items-center rounded-md border bg-muted/45 p-0.5"
          >
            <button
              type="button"
              :aria-pressed="viewMode === 'preview'"
              :class="[
                'flex h-6 cursor-pointer items-center gap-1.5 rounded px-2.5 text-sm transition-colors',
                viewMode === 'preview'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ]"
              @click="setViewMode('preview')"
            >
              <Eye class="size-3.5" />
              {{ t('detail.previewMode') }}
            </button>
            <button
              type="button"
              :aria-pressed="viewMode === 'source'"
              :disabled="!sourceAvailable"
              :class="[
                'flex h-6 items-center gap-1.5 rounded px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                viewMode === 'source'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ]"
              @click="setViewMode('source')"
            >
              <Code2 class="size-3.5" />
              {{ t('detail.sourceMode') }}
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 shrink-0 cursor-pointer"
            :aria-label="t('detail.closeResourcePreview')"
            :title="t('detail.closeResourcePreview')"
            @click="emit('close')"
          >
            <X class="size-4" />
          </Button>
        </header>

        <div v-if="loading" class="flex flex-1 flex-col gap-3 p-5">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-11/12" />
          <Skeleton class="h-4 w-4/5" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-3/5" />
        </div>

        <div
          v-else-if="error"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground"
        >
          <AlertCircle class="size-6" />
          <p class="text-sm">{{ t('detail.resourceReadFailed') }}</p>
        </div>

        <div
          v-else-if="preview?.kind === 'unsupported'"
          class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground"
        >
          <FileText class="size-6" />
          <p class="text-sm">{{ unsupportedMessage }}</p>
        </div>

        <template v-else-if="preview?.kind === 'text'">
          <p
            v-if="preview.truncated"
            class="mx-5 mt-4 shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
          >
            {{ t('detail.truncated') }}
          </p>
          <ScrollArea
            v-if="viewMode === 'source'"
            orientation="both"
            class="flex-1"
            viewport-class="h-full [&>div]:flex [&>div]:min-h-full [&>div]:flex-col"
          >
            <ResourceCodePreview
              :content="preview.content"
              :path="resource?.path ?? ''"
              :highlight="false"
            />
          </ScrollArea>
          <ScrollArea v-else-if="isMarkdown" class="flex-1" viewport-class="h-full">
            <MarkdownView
              :content="preview.content"
              preview-id="resource-preview"
              class="select-text px-5 py-4"
            />
          </ScrollArea>
          <ScrollArea
            v-else
            orientation="both"
            class="flex-1"
            viewport-class="h-full [&>div]:flex [&>div]:min-h-full [&>div]:flex-col"
          >
            <ResourceCodePreview :content="preview.content" :path="resource?.path ?? ''" />
          </ScrollArea>
        </template>

        <div
          v-else-if="preview?.kind === 'image'"
          class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/35 p-5"
        >
          <img
            :src="preview.dataUrl"
            :alt="resource?.path"
            class="max-h-full max-w-full object-contain"
          />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
