<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { InstallTarget } from '../../../../shared/ipc.js'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  installedTargets: InstallTarget[]
  busy: boolean
  error: string | null
}>()
const targetsModel = defineModel<InstallTarget[]>('targets', { required: true })
const emit = defineEmits<{ install: [] }>()

const { t } = useI18n()
</script>

<template>
  <section>
    <PlatformTargetPicker
      v-model="targetsModel"
      :label="t('detail.installTo')"
      :excluded="props.installedTargets"
    />
    <Button
      class="mt-3 cursor-pointer"
      size="sm"
      :disabled="targetsModel.length === 0 || props.busy"
      @click="emit('install')"
    >
      {{
        props.busy
          ? t('detail.installing')
          : t('detail.installN', { n: targetsModel.length })
      }}
    </Button>
    <p v-if="props.error" class="mt-2 break-all text-sm text-destructive">
      {{ props.error }}
    </p>
  </section>
</template>
