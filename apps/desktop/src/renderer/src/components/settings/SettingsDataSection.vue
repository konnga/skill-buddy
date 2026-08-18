<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_DESKTOP_PREFERENCES } from '../../../../shared/ipc.js'
import GitBackupPanel from '@/components/settings/GitBackupPanel.vue'
import { Button } from '@/components/ui/button'
import { showToast } from '@/composables/useToast'

const props = defineProps<{ query: string }>()
const { t } = useI18n()

const searching = computed(() => props.query.trim().length > 0)

function visible(...texts: string[]): boolean {
  if (!searching.value) return true
  const query = props.query.trim().toLowerCase()
  return texts.some((text) => text.toLowerCase().includes(query))
}

/** 收集应用自有的 skm.* 配置，避免导出其他站点或框架写入的 localStorage。 */
function collectLocalConfig(): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith('skm.')) continue
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      data[key] = JSON.parse(raw)
    } catch {
      data[key] = raw
    }
  }
  return data
}

async function exportConfig(): Promise<void> {
  const saved = await window.skillsManager.exportConfig(
    JSON.stringify(collectLocalConfig(), null, 2),
  )
  if (saved) showToast({ message: t('settings.dataExported') })
}

/** 导入时先同步主进程偏好，再写入渲染端配置，避免重载前出现两个真值源。 */
async function importConfig(): Promise<void> {
  const content = await window.skillsManager.importConfig()
  if (content === null) return
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const keys = Object.keys(parsed).filter((key) => key.startsWith('skm.'))
    if (keys.length === 0) throw new Error('empty')
    const currentDesktopPreferences = await window.skillsManager.getDesktopPreferences()
    await window.skillsManager.setDesktopPreferences({
      backgroundMode:
        typeof parsed['skm.backgroundMode'] === 'boolean'
          ? parsed['skm.backgroundMode']
          : currentDesktopPreferences.backgroundMode,
      launchHidden:
        typeof parsed['skm.launchHidden'] === 'boolean'
          ? parsed['skm.launchHidden']
          : currentDesktopPreferences.launchHidden,
    })
    for (const key of keys) localStorage.setItem(key, JSON.stringify(parsed[key]))
    location.reload()
  } catch {
    showToast({ message: t('settings.dataImportInvalid') })
  }
}

async function resetConfig(): Promise<void> {
  const confirmed = await window.skillsManager.confirmDialog({
    title: t('settings.dataResetTitle'),
    message: t('settings.dataResetMsg'),
    confirmLabel: t('settings.dataResetAction'),
    cancelLabel: t('common.cancel'),
    danger: true,
  })
  if (!confirmed) return
  await window.skillsManager.setDesktopPreferences(DEFAULT_DESKTOP_PREFERENCES)
  for (const key of Object.keys(collectLocalConfig())) localStorage.removeItem(key)
  location.reload()
}
</script>

<template>
  <section class="mb-10">
    <h2 class="mb-3 text-sm font-medium">{{ t('settings.catData') }}</h2>
    <GitBackupPanel
      v-if="!searching || visible(t('settings.backupTitle'), t('settings.backupDesc'))"
      class="mb-5"
    />
    <div class="divide-y rounded-xl border">
      <div
        v-if="visible(t('settings.dataExportTitle'), t('settings.dataExportDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.dataExportTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.dataExportDesc') }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 cursor-pointer"
          @click="exportConfig"
        >
          {{ t('settings.dataExportAction') }}
        </Button>
      </div>
      <div
        v-if="visible(t('settings.dataImportTitle'), t('settings.dataImportDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.dataImportTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.dataImportDesc') }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 cursor-pointer"
          @click="importConfig"
        >
          {{ t('settings.dataImportAction') }}
        </Button>
      </div>
      <div
        v-if="visible(t('settings.dataResetTitle'), t('settings.dataResetDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.dataResetTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.dataResetDesc') }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 cursor-pointer text-destructive"
          @click="resetConfig"
        >
          {{ t('settings.dataResetAction') }}
        </Button>
      </div>
    </div>
  </section>
</template>
