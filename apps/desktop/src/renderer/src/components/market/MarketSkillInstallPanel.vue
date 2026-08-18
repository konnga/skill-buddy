<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InstallTarget } from '../../../../shared/ipc.js'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  targets: InstallTarget[]
  busy: boolean
  error: string | null
}>()
const emit = defineEmits<{
  'update:targets': [value: InstallTarget[]]
  install: []
}>()

const { t } = useI18n()
const targetsModel = computed({
  get: () => props.targets,
  set: (value: InstallTarget[]) => emit('update:targets', value),
})
</script>

<template>
  <section class="flex flex-col gap-2 rounded-xl border bg-muted/20 px-5 py-4">
    <PlatformTargetPicker v-model="targetsModel" :label="t('team.installTo')" />
    <p v-if="props.error" class="break-all text-sm text-destructive">{{ props.error }}</p>
    <Button
      class="mt-1 w-fit cursor-pointer"
      :disabled="props.busy || props.targets.length === 0"
      @click="emit('install')"
    >
      {{
        props.busy
          ? t('market.installing')
          : t('detail.installN', { n: props.targets.length })
      }}
    </Button>
  </section>
</template>
