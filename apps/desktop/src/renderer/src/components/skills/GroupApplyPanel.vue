<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InstallTarget } from '#shared/ipc'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  open: boolean
  targets: InstallTarget[]
  busy: boolean
  note: string | null
  skillCount: number
  temporaryInstalledCount: number | null
}>()
const emit = defineEmits<{
  'update:targets': [value: InstallTarget[]]
  apply: []
  applyTemporary: []
  endTemporary: []
}>()

const { t } = useI18n()
const targetsModel = computed({
  get: () => props.targets,
  set: (value: InstallTarget[]) => emit('update:targets', value),
})
const actionDisabled = computed(
  () => props.busy || props.targets.length === 0 || props.skillCount === 0,
)
</script>

<template>
  <div v-if="props.open" class="mb-4 flex flex-col gap-2 rounded-lg py-3">
    <PlatformTargetPicker v-model="targetsModel" :label="t('groups.applyTitle')" />
    <div class="flex items-center gap-2">
      <Button
        size="sm"
        class="cursor-pointer"
        :disabled="actionDisabled"
        @click="emit('apply')"
      >
        {{
          props.busy
            ? t('detail.installing')
            : t('groups.apply', { n: props.skillCount })
        }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="actionDisabled"
        @click="emit('applyTemporary')"
      >
        {{ t('groups.applyTemp') }}
      </Button>
    </div>
    <p class="text-sm text-muted-foreground">{{ t('groups.tempHint') }}</p>
    <p v-if="props.note" class="text-sm text-amber-600 dark:text-amber-400">
      {{ props.note }}
    </p>
  </div>

  <div
    v-if="props.temporaryInstalledCount !== null"
    class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5"
  >
    <span class="text-sm text-sky-700 dark:text-sky-400">
      {{ t('groups.tempActive', { n: props.temporaryInstalledCount }) }}
    </span>
    <Button
      variant="outline"
      size="sm"
      class="shrink-0 cursor-pointer"
      :disabled="props.busy"
      @click="emit('endTemporary')"
    >
      {{ t('groups.endTemp') }}
    </Button>
  </div>
</template>
