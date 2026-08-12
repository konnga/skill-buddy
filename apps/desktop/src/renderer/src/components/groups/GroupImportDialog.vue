<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { useGroups } from '@/composables/useGroups'
import { showToast } from '@/composables/useToast'
import { mergePreset, parsePresetDocument } from '@/lib/preset-format'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { t } = useI18n()
const { groups } = useGroups()
const content = ref('')
const error = shallowRef<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      content.value = ''
      error.value = null
    }
  },
)

function submit(): void {
  try {
    const imported = parsePresetDocument(content.value)
    const outcome = mergePreset(groups.value, imported)
    if (outcome.result !== 'unchanged') groups.value = outcome.groups
    const messageKey = {
      created: 'groups.importCreated',
      merged: 'groups.importMerged',
      unchanged: 'groups.importUnchanged',
    }[outcome.result]
    showToast({
      message: t(messageKey, {
        name: imported.name,
        n: outcome.addedSkills,
      }),
    })
    emit('update:open', false)
  } catch {
    error.value = t('groups.importInvalid')
  }
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(open) => emit('update:open', open)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="text-base font-semibold tracking-tight">
          {{ t('groups.importTitle') }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t('groups.importDescription') }}
        </DialogDescription>
        <textarea
          v-model="content"
          class="mt-4 min-h-52 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          :placeholder="t('groups.importPlaceholder')"
          spellcheck="false"
          @input="error = null"
        />
        <p v-if="error" class="mt-2 text-sm text-destructive">
          {{ error }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('update:open', false)">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="!content.trim()"
            @click="submit"
          >
            {{ t('groups.importAction') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
