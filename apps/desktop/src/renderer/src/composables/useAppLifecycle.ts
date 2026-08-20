import { onMounted, onUnmounted, watch } from 'vue'
import { setPlatformNames } from '@/lib/agents'
import { runImportSync } from '@/composables/useImportSync'
import { syncCustomPlatforms, useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

export interface AppLifecycleOptions {
  refreshLocal: () => Promise<void>
}

/** 连接应用级快捷键、启动扫描与后台同步。 */
export function useAppLifecycle(options: AppLifecycleOptions): void {
  const { sidebarCollapsed } = useSettings()
  const { platforms, skills } = useSkills()

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

  /** 首屏完成后再加载团队合规数据，避免 Git 与项目扫描阻塞应用启动。 */
  function warmTeamAttention(): void {
    const load = async (): Promise<void> => {
      const [{ useTeamLibraries }, { useTeamProjects }] = await Promise.all([
        import('@/composables/useTeamLibraries'),
        import('@/composables/useTeamProjects'),
      ])
      useTeamLibraries()
      useTeamProjects()
    }
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => void load(), { timeout: 2_000 })
      return
    }
    globalThis.setTimeout(() => void load(), 500)
  }

  onMounted(async () => {
    window.addEventListener('keydown', onSidebarShortcut)
    await syncCustomPlatforms()
    await options.refreshLocal()
    warmTeamAttention()
  })

  onUnmounted(() => window.removeEventListener('keydown', onSidebarShortcut))
}
