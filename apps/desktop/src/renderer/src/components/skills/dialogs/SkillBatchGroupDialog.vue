<script setup lang="ts">
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

const props = defineProps<{
  open: boolean
  selectedNames: Set<string>
  groups: { name: string }[]
  selectedCount: number
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  toggleGroup: [name: string]
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ t('batch.addGroupsTitle') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t('batch.addGroupsHint', { n: props.selectedCount }) }}
        </DialogDescription>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="group in props.groups"
            :key="group.name"
            type="button"
            :class="[
              'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
              props.selectedNames.has(group.name)
                ? 'border-foreground bg-foreground text-background'
                : 'hover:border-foreground/40',
            ]"
            @click="emit('toggleGroup', group.name)"
          >
            {{ group.name }}
          </button>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            @click="emit('update:open', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="props.selectedNames.size === 0"
            @click="emit('confirm')"
          >
            {{ t('batch.addGroupsAction', { n: props.selectedNames.size }) }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
