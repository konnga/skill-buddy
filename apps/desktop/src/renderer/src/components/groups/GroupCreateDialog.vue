<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGroups } from '@/composables/useGroups'

const props = defineProps<{
  open: boolean
  skillNames?: string[]
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  created: [name: string]
}>()

const { t } = useI18n()
const { groups, createGroup } = useGroups()
const name = shallowRef('')

watch(
  () => props.open,
  (open) => {
    if (open) name.value = ''
  },
)

function submit(): void {
  const trimmed = name.value.trim()
  if (!createGroup(trimmed, props.skillNames)) return
  emit('created', trimmed)
  emit('update:open', false)
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(open) => emit('update:open', open)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="mb-4 text-base font-semibold tracking-tight">
          {{ t('groups.createTitle') }}
        </DialogTitle>
        <Input
          v-model="name"
          :placeholder="t('groups.createPh')"
          class="text-sm"
          autofocus
          @keydown.enter.prevent="submit"
        />
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('update:open', false)">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="!name.trim() || groups.some((g) => g.name === name.trim())"
            @click="submit"
          >
            {{ t('common.add') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
