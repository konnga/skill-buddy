<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** 技能包重命名弹窗只维护输入契约，名称校验和持久化由页面编排层处理。 */
const props = defineProps<{
  open: boolean
  value: string
  duplicate: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:value': [value: string]
  submit: []
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="text-base font-semibold">{{ t('groups.renameTitle') }}</DialogTitle>
        <Input
          :model-value="props.value"
          class="mt-4"
          autofocus
          @update:model-value="emit('update:value', $event)"
          @keydown.enter.prevent="emit('submit')"
        />
        <p v-if="props.duplicate" class="mt-2 text-sm text-destructive">
          {{ t('groups.renameDuplicate') }}
        </p>
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
            :disabled="!props.value.trim() || props.duplicate"
            @click="emit('submit')"
          >
            {{ t('groups.renameAction') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
