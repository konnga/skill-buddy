<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { showToast } from '@/composables/useToast'

const { t } = useI18n()
const {
  hasDownload,
  updateResult,
  downloading,
  downloaded,
  downloadPercent,
  downloadError,
  downloadUpdate,
} = useAppUpdate()

const actionLabel = computed(() => {
  if (downloaded.value) return t('settings.aboutDownloaded')
  if (downloading.value) return t('settings.aboutDownloading', { progress: downloadPercent.value })
  return t('settings.aboutDownloadVersion', {
    version: updateResult.value?.status === 'update' ? updateResult.value.latest : '',
  })
})

watch(downloadError, (message) => {
  if (message) showToast({ message: t('settings.aboutDownloadFailed', { msg: message }) })
})
</script>

<template>
  <Button
    v-if="hasDownload"
    type="button"
    variant="outline"
    size="sm"
    :class="[
      'app-no-drag cursor-pointer border-amber-500 bg-amber-500 text-white hover:bg-amber-600 hover:text-white',
      downloading ? 'min-w-16 rounded-full px-2 tabular-nums' : 'size-8 rounded-full p-0',
    ]"
    :loading="downloading"
    :disabled="downloaded"
    :title="actionLabel"
    :aria-label="actionLabel"
    @click="downloadUpdate"
  >
    <Check v-if="downloaded" class="size-3.5" />
    <Download v-else-if="!downloading" class="size-3.5" />
    <span v-if="downloading">{{ downloadPercent }}%</span>
  </Button>
</template>
