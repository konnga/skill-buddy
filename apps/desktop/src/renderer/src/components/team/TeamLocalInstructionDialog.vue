<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { FileCog, X } from '@lucide/vue'
import type { InstructionDocument } from '#shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useInstructions } from '@/composables/useInstructions'

const props = defineProps<{ open: boolean; busy?: boolean }>()

const emit = defineEmits<{
  close: []
  select: [document: InstructionDocument]
}>()

const { t } = useI18n()
const { documents, loading, refresh } = useInstructions()
const keyword = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    keyword.value = ''
    void refresh()
  },
)

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return documents.value
    .filter((document) => {
      if (!query) return true
      return (
        document.fileName.toLowerCase().includes(query) ||
        document.path.toLowerCase().includes(query)
      )
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
})

/** 项目根只显示最后一级目录名，完整路径放在 title 里。 */
function scopeLabel(document: InstructionDocument): string {
  if (document.scope === 'user') return t('team.localInstructionGlobal')
  const root = document.projectRoot ?? ''
  return root.split(/[/\\]/).filter(Boolean).at(-1) ?? root
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,88vh)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start gap-3 border-b px-5 py-4">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/25">
            <FileCog class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <DialogTitle class="text-base font-semibold">{{ t('team.localInstructionDialogTitle') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('team.localInstructionDialogDescription') }}
            </DialogDescription>
          </span>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer"
            :title="t('common.close')"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X />
          </Button>
        </div>

        <div class="border-b px-5 py-3">
          <Input v-model="keyword" :placeholder="t('team.localInstructionSearch')" class="h-8" />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="loading && documents.length === 0" class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <LoadingSpinner />
            <span>{{ t('team.localInstructionScanning') }}</span>
          </p>
          <p v-else-if="filtered.length === 0" class="py-16 text-center text-sm text-muted-foreground">
            {{ keyword.trim() ? t('team.localInstructionNoMatch') : t('team.localInstructionEmpty') }}
          </p>
          <ul v-else class="divide-y">
            <li v-for="document in filtered" :key="document.id">
              <button
                type="button"
                :disabled="props.busy"
                :title="document.path"
                class="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                @click="emit('select', document)"
              >
                <FileCog class="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ document.fileName }}</span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ document.path }}
                  </span>
                </span>
                <Badge variant="secondary" class="shrink-0">{{ scopeLabel(document) }}</Badge>
              </button>
            </li>
          </ul>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
