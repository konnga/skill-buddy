import { computed, ref, shallowRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlatformStatus } from '@skillbuddy/core'
import type { CustomPlatformInput, TeamLibraryConfig } from '../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../shared/team-library.js'
import { syncCustomPlatforms, useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeamLibraries } from '@/composables/useTeamLibraries'
import type { CustomPlatformForm } from '@/components/settings/SettingsPlatformsSection.vue'

export interface TeamLibraryRow {
  key: string
  config: TeamLibraryConfig
  name: string
  id?: string
  error?: string
  warning?: string
}

interface UseSettingsPageSectionsOptions {
  query: Readonly<Ref<string>>
}

function repositoryLabel(remoteUrl: string): string {
  return remoteUrl.replace(/\/$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') || remoteUrl
}

/** 汇总设置页各业务分区的状态与动作，让页面组件只负责导航和布局编排。 */
export function useSettingsPageSections(options: UseSettingsPageSectionsOptions) {
  const { query } = options
  const { t } = useI18n()
  const settings = useSettings()
  const { platforms, refresh } = useSkills()
  const {
    catalogs: teamLibraryCatalogs,
    errors: teamLibraryErrors,
    warnings: teamLibraryWarnings,
  } = useTeamLibraries()

  const effectiveMode = computed<'light' | 'dark'>(() =>
    settings.theme.value === 'dark' ||
    (settings.theme.value === 'system' && settings.systemDark.value)
      ? 'dark'
      : 'light',
  )

  const visiblePlatforms = computed<PlatformStatus[]>(() => {
    const normalizedQuery = query.value.trim().toLowerCase()
    if (!normalizedQuery) return platforms.value
    return platforms.value.filter((platform) =>
      [platform.displayName, platform.id].some((text) =>
        text.toLowerCase().includes(normalizedQuery),
      ),
    )
  })

  /** 目录变更后立即刷新扫描结果，保证工作区筛选与安装目标同步。 */
  async function addProjectRoot(): Promise<void> {
    const directory = await window.skillsManager.pickDirectory()
    if (!directory || settings.projectRoots.value.includes(directory)) return
    settings.projectRoots.value = [...settings.projectRoots.value, directory]
    await refresh()
  }

  async function removeProjectRoot(root: string): Promise<void> {
    settings.projectRoots.value = settings.projectRoots.value.filter((item) => item !== root)
    await refresh()
  }

  const showPlatformForm = shallowRef(false)
  const platformForm = ref<CustomPlatformForm>({
    id: '',
    displayName: '',
    userSkillsDir: '',
    projectSkillsDir: '',
    detectPath: '',
  })
  const platformFormError = shallowRef<string | null>(null)

  /** 校验通过后先同步主进程平台注册表，再刷新平台探测状态。 */
  async function addCustomPlatform(): Promise<void> {
    platformFormError.value = null
    const form = platformForm.value
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.id)) {
      platformFormError.value = t('settings.errKebab')
      return
    }
    if (!form.displayName || !form.detectPath || !form.userSkillsDir) {
      platformFormError.value = t('settings.errRequired')
      return
    }

    const definition: CustomPlatformInput = {
      id: form.id,
      displayName: form.displayName,
      userSkillsDir: form.userSkillsDir || null,
      projectSkillsDir: form.projectSkillsDir || null,
      detectPath: form.detectPath,
    }
    settings.customPlatforms.value = [
      ...settings.customPlatforms.value.filter((platform) => platform.id !== definition.id),
      definition,
    ]
    await syncCustomPlatforms()
    await refresh()
    showPlatformForm.value = false
    platformForm.value = {
      id: '',
      displayName: '',
      userSkillsDir: '',
      projectSkillsDir: '',
      detectPath: '',
    }
  }

  async function removeCustomPlatform(id: string): Promise<void> {
    settings.customPlatforms.value = settings.customPlatforms.value.filter(
      (platform) => platform.id !== id,
    )
    await refresh()
  }

  const teamLibraryRows = computed<TeamLibraryRow[]>(() =>
    settings.teamLibraries.value.map((library) => {
      const key = teamLibraryConfigKey(library)
      const catalog = teamLibraryCatalogs.value.find(
        (candidate) => teamLibraryConfigKey(candidate.source) === key,
      )
      return {
        key,
        config: library,
        name: catalog?.source.libraryName ?? repositoryLabel(library.remoteUrl),
        id: catalog?.source.libraryId,
        error: teamLibraryErrors.value[key],
        warning: teamLibraryWarnings.value[key],
      }
    }),
  )

  function addTeamLibrary(library: TeamLibraryConfig): void {
    settings.teamLibraries.value = [
      ...settings.teamLibraries.value.filter(
        (item) => item.remoteUrl.trim() !== library.remoteUrl.trim(),
      ),
      library,
    ]
  }

  function removeTeamLibrary(key: string): void {
    settings.teamLibraries.value = settings.teamLibraries.value.filter(
      (library) => teamLibraryConfigKey(library) !== key,
    )
  }

  return {
    ...settings,
    effectiveMode,
    visiblePlatforms,
    addProjectRoot,
    removeProjectRoot,
    showPlatformForm,
    platformForm,
    platformFormError,
    addCustomPlatform,
    removeCustomPlatform,
    teamLibraryRows,
    addTeamLibrary,
    removeTeamLibrary,
  }
}
