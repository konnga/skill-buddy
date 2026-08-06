import { ref, watch } from 'vue'
import type { CustomPlatformInput } from '../../../shared/ipc.js'

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
  return { projectRoots, customPlatforms, theme }
}
