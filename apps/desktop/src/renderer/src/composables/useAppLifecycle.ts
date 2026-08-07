import { onMounted, onUnmounted, watch } from 'vue'
import { setPlatformNames } from '@/lib/agents'
import { runImportSync } from '@/composables/useImportSync'
import { syncCustomPlatforms, useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

/** 连接应用级快捷键、启动扫描与后台同步。 */
export function useAppLifecycle(): void {
  const { sidebarCollapsed } = useSettings()
  const { platforms, skills, refresh } = useSkills()

  watch(platforms, (value) => setPlatformNames(value))
  watch(skills, () => void runImportSync())

  function onSidebarShortcut(event: KeyboardEvent): void {
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'b'
    ) {
      event.preventDefault()
      sidebarCollapsed.value = !sidebarCollapsed.value
    }
  }

  onMounted(async () => {
    window.addEventListener('keydown', onSidebarShortcut)
    await syncCustomPlatforms()
    await refresh()
  })

  onUnmounted(() => window.removeEventListener('keydown', onSidebarShortcut))
}
