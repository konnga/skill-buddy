<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  manageableCount: number
  confirming: boolean
  busy: boolean
}>()
const emit = defineEmits<{
  requestConfirm: []
  cancel: []
  uninstall: []
}>()

const { t } = useI18n()
</script>

<template>
  <section
    v-if="props.manageableCount > 0"
    class="flex items-center justify-between rounded-md border px-4 py-3"
  >
    <p class="text-sm text-muted-foreground">
      {{ t('detail.manageableCount', { n: props.manageableCount }) }}
    </p>
    <div class="flex items-center gap-2">
      <template v-if="props.confirming">
        <span class="text-sm text-muted-foreground">
          {{ t('detail.deleteConfirm', { n: props.manageableCount }) }}
        </span>
        <Button
          variant="destructive"
          size="sm"
          class="cursor-pointer"
          :disabled="props.busy"
          @click="emit('uninstall')"
        >
          {{ t('detail.confirmDelete') }}
        </Button>
        <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button>
      </template>
      <Button
        v-else
        variant="ghost"
        size="sm"
        class="cursor-pointer text-destructive hover:text-destructive"
        @click="emit('requestConfirm')"
      >
        <Trash2 />
        {{ t('common.delete') }}
      </Button>
    </div>
  </section>
</template>
