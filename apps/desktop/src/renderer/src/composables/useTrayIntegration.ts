import { computed, onMounted, onUnmounted, watch } from 'vue'
import type { TrayCommand, TrayStatus } from '#shared/ipc'
import { useAttentionSummary } from './useAttentionSummary'
import { useMcpServers } from './useMcpServers'
import { useSettings } from './useSettings'
import { useSkills } from './useSkills'
import { useTeamLibraries } from './useTeamLibraries'
import { useTeamProjects } from './useTeamProjects'

export interface TrayIntegrationOptions {
  openAttention?: () => void
  openSettings?: () => void
}

/** 连接渲染进程业务状态与原生托盘菜单。 */
export function useTrayIntegration(options: TrayIntegrationOptions = {}) {
  const { autoRefresh, language } = useSettings()
  const skillsState = useSkills()
  const mcpState = useMcpServers()
  const { refreshInstallations } = useTeamLibraries()
  const teamProjectsState = useTeamProjects()
  const { count: attentionCount } = useAttentionSummary()

  const lastCheckedAt = computed(() => {
    const values = [skillsState.lastCheckedAt.value, mcpState.lastCheckedAt.value]
    if (values.some((value) => value === null)) return null
    return Math.min(...(values as number[]))
  })

  const phase = computed<TrayStatus['phase']>(() => {
    if (skillsState.error.value || mcpState.error.value || mcpState.scanErrors.value.length > 0) {
      return 'error'
    }
    if (
      skillsState.loading.value ||
      mcpState.loading.value ||
      teamProjectsState.loading.value
    ) {
      return 'scanning'
    }
    return 'idle'
  })

  const errorMessage = computed(
    () =>
      skillsState.error.value ||
      mcpState.error.value ||
      mcpState.scanErrors.value[0]?.message ||
      undefined,
  )

  const status = computed<TrayStatus>(() => ({
    phase: phase.value,
    attentionCount: attentionCount.value,
    lastCheckedAt: lastCheckedAt.value,
    autoRefresh: autoRefresh.value,
    locale: language.value === 'en' ? 'en' : 'zh-CN',
    ...(errorMessage.value ? { errorMessage: errorMessage.value } : {}),
  }))

  async function refreshLocal(): Promise<void> {
    await Promise.all([
      skillsState.refresh(),
      mcpState.refresh(),
      refreshInstallations(),
      teamProjectsState.refresh(),
    ])
  }

  function onCommand(command: TrayCommand): void {
    if (command === 'refresh') void refreshLocal()
    else if (command === 'toggle-auto-refresh') autoRefresh.value = !autoRefresh.value
    else if (command === 'open-attention') options.openAttention?.()
    else if (command === 'open-settings') options.openSettings?.()
  }

  watch(
    status,
    (value) => void window.skillsManager.updateTrayStatus(value),
    { immediate: true },
  )

  onMounted(() => window.skillsManager.onTrayCommand(onCommand))
  onUnmounted(() => window.skillsManager.removeTrayCommandListeners())

  return { status, refreshLocal }
}
