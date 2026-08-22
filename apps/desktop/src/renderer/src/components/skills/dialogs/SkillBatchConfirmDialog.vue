<script setup lang="ts">
import { computed } from 'vue'
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
import type { BatchRequest } from '@/lib/skill-action-types'

const props = defineProps<{
  request: BatchRequest | null
  busy: boolean
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
  confirm: []
}>()

const { t } = useI18n()

const title = computed(() => (props.request ? t(`batch.${props.request.action}Title`) : ''))
const description = computed(() => {
  const request = props.request
  if (!request) return ''

  const installations = request.items.reduce((count, item) => count + item.targets.length, 0)
  return t(`batch.${request.action}Confirm`, {
    skills: request.items.length,
    installations,
  })
})
const action = computed(() => (props.request ? t(`batch.${props.request.action}Action`) : ''))
</script>

<template>
  <DialogRoot :open="Boolean(props.request)" @update:open="emit('openChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          {{ description }}
        </DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="props.busy"
            @click="emit('openChange', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            :variant="props.request?.action === 'uninstall' ? 'destructive' : 'default'"
            size="sm"
            class="cursor-pointer"
            :loading="props.busy"
            @click="emit('confirm')"
          >
            {{ action }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
