import { ref, watch } from 'vue'
import type { CustomPlatformInput } from '../../../shared/ipc.js'
import { detectLocale, i18n, type Locale } from '../i18n.js'

export type ThemeMode = 'system' | 'light' | 'dark'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const projectRoots = ref<string[]>(load('skm.projectRoots', []))
const customPlatforms = ref<CustomPlatformInput[]>(load('skm.customPlatforms', []))
const theme = ref<ThemeMode>(load('skm.theme', 'system'))
const language = ref<Locale>(load('skm.language', detectLocale()))
const registryUrl = ref<string>(load('skm.registryUrl', ''))
/** Registry token lives in the OS keychain (via safeStorage), not localStorage. */
const registryToken = ref<string>('')

void (async () => {
  // one-time migration from the old plaintext localStorage slot
  const legacy = load('skm.registryToken', '')
  if (legacy) {
    await window.skillsManager.secureSet('registryToken', legacy)
    localStorage.removeItem('skm.registryToken')
  }
  registryToken.value = await window.skillsManager.secureGet('registryToken')
  watch(registryToken, (v) => void window.skillsManager.secureSet('registryToken', v))
})()
const sidebarCollapsed = ref<boolean>(load('skm.sidebarCollapsed', false))

export interface SkillGroup {
  name: string
  skills: string[]
}

const groups = ref<SkillGroup[]>(load('skm.groups', []))
watch(groups, (v) => localStorage.setItem('skm.groups', JSON.stringify(v)), { deep: true })

/** One temporary group application: exactly what we installed, for exact rollback. */
export interface TempApplication {
  group: string
  appliedAt: number
  installed: { name: string; agent: string; scope: string; path: string }[]
}

const tempApplications = ref<TempApplication[]>(load('skm.tempApplications', []))

/** A standing source→target import connection ("keep in sync"). */
export interface ImportSyncPair {
  source: string
  target: string
  scope: string
  projectRoot?: string
  /** skill names already handled — each syncs at most once (additive, never re-forced) */
  synced: string[]
}

const importSyncPairs = ref<ImportSyncPair[]>(load('skm.importSyncPairs', []))
watch(
  importSyncPairs,
  (v) => localStorage.setItem('skm.importSyncPairs', JSON.stringify(v)),
  { deep: true },
)

watch(
  tempApplications,
  (v) => localStorage.setItem('skm.tempApplications', JSON.stringify(v)),
  { deep: true },
)

watch(registryUrl, (v) => localStorage.setItem('skm.registryUrl', JSON.stringify(v)))
watch(sidebarCollapsed, (v) => localStorage.setItem('skm.sidebarCollapsed', JSON.stringify(v)))

i18n.global.locale.value = language.value
watch(language, (v) => {
  localStorage.setItem('skm.language', JSON.stringify(v))
  i18n.global.locale.value = v
})

watch(projectRoots, (v) => localStorage.setItem('skm.projectRoots', JSON.stringify(v)), {
  deep: true,
})
watch(customPlatforms, (v) => localStorage.setItem('skm.customPlatforms', JSON.stringify(v)), {
  deep: true,
})
watch(theme, (v) => {
  localStorage.setItem('skm.theme', JSON.stringify(v))
  applyTheme()
})

const media = window.matchMedia('(prefers-color-scheme: dark)')
media.addEventListener('change', () => applyTheme())

export function applyTheme(): void {
  const dark = theme.value === 'dark' || (theme.value === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  // The macOS window vibrancy (transparent sidebar) renders in the OS theme,
  // so a fixed light/dark choice must also be pushed to the main process.
  void window.skillsManager?.setTheme(theme.value)
}

/** Push persisted custom platforms into the main-process registry. */
export async function syncCustomPlatforms(): Promise<void> {
  if (customPlatforms.value.length > 0) {
    await window.skillsManager.registerPlatforms(
      customPlatforms.value.map((p) => ({ ...p })),
    )
  }
}

export function useSettings() {
  return { projectRoots, customPlatforms, theme, language, registryUrl, registryToken, sidebarCollapsed, groups, tempApplications, importSyncPairs }
}
