import { ref, shallowRef, watch } from 'vue'
import type { CustomPlatformInput, LinkOpenMode, TeamLibraryConfig } from '../../../shared/ipc.js'
import { detectLocale, i18n, type Locale } from '../i18n.js'
import type { MarketSkillSource } from '../lib/market.js'
import { applyAppearance } from './useAppearance.js'

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
/** GitHub Token（提高市场搜索限额），同样存系统钥匙串。 */
const githubToken = ref<string>('')

void (async () => {
  githubToken.value = await window.skillsManager.secureGet('githubToken')
  watch(githubToken, (v) => void window.skillsManager.secureSet('githubToken', v))
})()
const sidebarCollapsed = ref<boolean>(load('skm.sidebarCollapsed', false))

/** 打开链接方式：默认浏览器或应用内浏览器；主进程按此分流所有外链。 */
const linkOpenMode = ref<LinkOpenMode>(load('skm.linkOpenMode', 'external'))
void window.skillsManager?.setLinkOpenMode(linkOpenMode.value)
watch(linkOpenMode, (v) => {
  localStorage.setItem('skm.linkOpenMode', JSON.stringify(v))
  void window.skillsManager?.setLinkOpenMode(v)
})

/** HTTP 代理（作用于市场请求与应用内浏览器），空串跟随系统。 */
const proxyUrl = ref<string>(load('skm.proxyUrl', ''))
void window.skillsManager?.setProxy(proxyUrl.value)
watch(proxyUrl, (v) => {
  localStorage.setItem('skm.proxyUrl', JSON.stringify(v))
  void window.skillsManager?.setProxy(v)
})

/** 技能目录变化时自动静默刷新。 */
const autoRefresh = ref<boolean>(load('skm.autoRefresh', true))
watch(autoRefresh, (v) => localStorage.setItem('skm.autoRefresh', JSON.stringify(v)))

/** 检测到新的内容漂移时发送系统通知。 */
const notifyDrift = ref<boolean>(load('skm.notifyDrift', false))
watch(notifyDrift, (v) => localStorage.setItem('skm.notifyDrift', JSON.stringify(v)))

/** 卸载 skill 前弹原生确认框。 */
const confirmUninstall = ref<boolean>(load('skm.confirmUninstall', false))
watch(confirmUninstall, (v) => localStorage.setItem('skm.confirmUninstall', JSON.stringify(v)))

/** 全局唤起快捷键（Electron accelerator 语法），空串表示关闭。 */
const globalShortcut = ref<string>(load('skm.globalShortcut', ''))
/** 最近一次快捷键注册是否成功（无效或被占用时为 false）。 */
const globalShortcutOk = ref(true)
void (async () => {
  if (globalShortcut.value) {
    globalShortcutOk.value =
      (await window.skillsManager?.setGlobalShortcut(globalShortcut.value)) ?? false
  }
})()
watch(globalShortcut, async (v) => {
  localStorage.setItem('skm.globalShortcut', JSON.stringify(v))
  globalShortcutOk.value = (await window.skillsManager?.setGlobalShortcut(v)) ?? false
})

/** 开机自启动：真值以系统为准，启动时读入，修改时写回。 */
const launchAtLogin = shallowRef(false)
const launchAtLoginReady = shallowRef(false)
void (async () => {
  try {
    launchAtLogin.value = (await window.skillsManager?.getLoginItem()) ?? false
  } catch {
    launchAtLogin.value = false
  } finally {
    launchAtLoginReady.value = true
    watch(launchAtLogin, (value) => void window.skillsManager?.setLoginItem(value))
  }
})()

/** 关闭主窗口后继续在菜单栏/系统托盘中运行。 */
const backgroundMode = shallowRef<boolean>(load('skm.backgroundMode', true))
/** 通过开机自启动进入应用时不主动显示主窗口。 */
const launchHidden = shallowRef<boolean>(load('skm.launchHidden', false))
const desktopPreferencesReady = shallowRef(false)

function syncDesktopPreferences(): void {
  localStorage.setItem('skm.backgroundMode', JSON.stringify(backgroundMode.value))
  localStorage.setItem('skm.launchHidden', JSON.stringify(launchHidden.value))
  void window.skillsManager?.setDesktopPreferences({
    backgroundMode: backgroundMode.value,
    launchHidden: launchHidden.value,
  })
}

void (async () => {
  try {
    const preferences = await window.skillsManager.getDesktopPreferences()
    backgroundMode.value = preferences.backgroundMode
    launchHidden.value = preferences.launchHidden
  } catch {
    backgroundMode.value = load('skm.backgroundMode', true)
    launchHidden.value = load('skm.launchHidden', false)
  } finally {
    localStorage.setItem('skm.backgroundMode', JSON.stringify(backgroundMode.value))
    localStorage.setItem('skm.launchHidden', JSON.stringify(launchHidden.value))
    desktopPreferencesReady.value = true
    watch([backgroundMode, launchHidden], syncDesktopPreferences)
  }
})()

/** 企业团队库 Git 仓库；顺序同时表示目录展示优先级。 */
const teamLibraries = shallowRef<TeamLibraryConfig[]>(load('skm.teamLibraries', []))
watch(teamLibraries, (value) => localStorage.setItem('skm.teamLibraries', JSON.stringify(value)))

export interface SkillGroup {
  name: string
  skills: string[]
}

const groups = ref<SkillGroup[]>(load('skm.groups', []))
watch(groups, (v) => localStorage.setItem('skm.groups', JSON.stringify(v)), { deep: true })

/** 市场 Skill 的稳定来源索引；技能包仍只保存名称，保持 Preset 格式兼容。 */
const marketSkillSources = ref<Record<string, Record<string, MarketSkillSource>>>(
  load('skm.marketSkillSources', {}),
)
watch(
  marketSkillSources,
  (value) => localStorage.setItem('skm.marketSkillSources', JSON.stringify(value)),
  { deep: true },
)

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
const systemDark = ref(media.matches)
media.addEventListener('change', () => {
  systemDark.value = media.matches
  applyTheme()
})

export function applyTheme(): void {
  const dark = theme.value === 'dark' || (theme.value === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  applyAppearance(dark)
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
  return {
    projectRoots,
    customPlatforms,
    theme,
    language,
    githubToken,
    sidebarCollapsed,
    groups,
    marketSkillSources,
    tempApplications,
    importSyncPairs,
    systemDark,
    linkOpenMode,
    proxyUrl,
    autoRefresh,
    notifyDrift,
    confirmUninstall,
    globalShortcut,
    globalShortcutOk,
    launchAtLogin,
    launchAtLoginReady,
    backgroundMode,
    launchHidden,
    desktopPreferencesReady,
    teamLibraries,
  }
}
