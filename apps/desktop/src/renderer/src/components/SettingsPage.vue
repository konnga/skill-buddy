<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Blocks,
  Database,
  FolderGit2,
  FolderPlus,
  Globe,
  Info,
  Palette,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Users,
} from '@lucide/vue'
import type {
  AppInfo,
  CustomPlatformInput,
  RegistryTestResult,
  UpdateCheckResult,
} from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import skillbuddyMarkUrl from '@/assets/skillbuddy-mark.svg'
import CopyButton from '@/components/CopyButton.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import ThemeCodePreview from '@/components/appearance/ThemeCodePreview.vue'
import ThemeModeCards from '@/components/appearance/ThemeModeCards.vue'
import ThemeStylePanel from '@/components/appearance/ThemeStylePanel.vue'
import { useSettings, syncCustomPlatforms, type RegistryProfile } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'

const emit = defineEmits<{ back: [] }>()

const {
  projectRoots,
  customPlatforms,
  theme,
  language,
  registryUrl,
  registryToken,
  githubToken,
  systemDark,
  linkOpenMode,
  proxyUrl,
  autoRefresh,
  notifyDrift,
  defaultInstallScope,
  confirmUninstall,
  globalShortcut,
  globalShortcutOk,
  launchAtLogin,
  registryProfiles,
} = useSettings()
const { t } = useI18n()
const { platforms, refresh } = useSkills()

type Category =
  | 'general'
  | 'appearance'
  | 'behavior'
  | 'registry'
  | 'platforms'
  | 'network'
  | 'projects'
  | 'data'
  | 'about'
const category = ref<Category>('general')
const query = ref('')

const groups: { labelKey: string; items: { id: Category; labelKey: string; icon: unknown }[] }[] =
  [
    {
      labelKey: 'settings.groupPersonal',
      items: [
        { id: 'general', labelKey: 'settings.catGeneral', icon: Settings2 },
        { id: 'appearance', labelKey: 'settings.catAppearance', icon: Palette },
        { id: 'behavior', labelKey: 'settings.catBehavior', icon: SlidersHorizontal },
      ],
    },
    {
      labelKey: 'settings.groupIntegrations',
      items: [
        { id: 'registry', labelKey: 'settings.catRegistry', icon: Users },
        { id: 'platforms', labelKey: 'settings.catPlatforms', icon: Blocks },
        { id: 'network', labelKey: 'settings.catNetwork', icon: Globe },
      ],
    },
    {
      labelKey: 'settings.groupWorkspace',
      items: [
        { id: 'projects', labelKey: 'settings.catProjects', icon: FolderGit2 },
        { id: 'data', labelKey: 'settings.catData', icon: Database },
      ],
    },
    {
      labelKey: 'settings.groupApp',
      items: [{ id: 'about', labelKey: 'settings.catAbout', icon: Info }],
    },
  ]

const searching = computed(() => query.value.trim().length > 0)

const activeTitle = computed(() => {
  if (searching.value) return t('settings.searchPh').replace('…', '').replace('...', '')
  const item = groups.flatMap((g) => g.items).find((i) => i.id === category.value)
  return item ? t(item.labelKey) : ''
})

/** With an active search, a row is visible if any of its texts match. */
function visible(...texts: string[]): boolean {
  if (!searching.value) return true
  const q = query.value.trim().toLowerCase()
  return texts.some((text) => text.toLowerCase().includes(q))
}

/** Show a category's content when selected, or always while searching. */
function showCat(id: Category): boolean {
  return searching.value ? true : category.value === id
}

/** 当前实际生效的明暗模式（system 时跟随系统），决定编辑哪套主题。 */
const effectiveMode = computed<'light' | 'dark'>(() =>
  theme.value === 'dark' || (theme.value === 'system' && systemDark.value) ? 'dark' : 'light',
)

/* project roots */
async function addProjectRoot(): Promise<void> {
  const dir = await window.skillsManager.pickDirectory()
  if (dir && !projectRoots.value.includes(dir)) {
    projectRoots.value = [...projectRoots.value, dir]
    await refresh()
  }
}

async function removeProjectRoot(root: string): Promise<void> {
  projectRoots.value = projectRoots.value.filter((r) => r !== root)
  await refresh()
}

/* custom platforms */
const showForm = ref(false)
const form = ref({
  id: '',
  displayName: '',
  userSkillsDir: '',
  projectSkillsDir: '',
  detectPath: '',
})
const formError = ref<string | null>(null)

async function addCustomPlatform(): Promise<void> {
  formError.value = null
  const f = form.value
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.id)) {
    formError.value = t('settings.errKebab')
    return
  }
  if (!f.displayName || !f.detectPath || !f.userSkillsDir) {
    formError.value = t('settings.errRequired')
    return
  }
  const def: CustomPlatformInput = {
    id: f.id,
    displayName: f.displayName,
    userSkillsDir: f.userSkillsDir || null,
    projectSkillsDir: f.projectSkillsDir || null,
    detectPath: f.detectPath,
  }
  customPlatforms.value = [...customPlatforms.value.filter((p) => p.id !== def.id), def]
  await syncCustomPlatforms()
  await refresh()
  showForm.value = false
  form.value = { id: '', displayName: '', userSkillsDir: '', projectSkillsDir: '', detectPath: '' }
}

async function removeCustomPlatform(id: string): Promise<void> {
  customPlatforms.value = customPlatforms.value.filter((p) => p.id !== id)
  await refresh()
}

/* registry：连接测试与已保存连接 */
const registryTesting = ref(false)
const registryTestResult = ref<RegistryTestResult | null>(null)

async function testRegistry(): Promise<void> {
  registryTesting.value = true
  registryTestResult.value = null
  try {
    registryTestResult.value = await window.skillsManager.registryTest({
      url: registryUrl.value,
      token: registryToken.value,
    })
  } finally {
    registryTesting.value = false
  }
}

const profileName = ref('')

async function saveProfile(): Promise<void> {
  const name = profileName.value.trim()
  if (!name || !registryUrl.value.trim()) return
  await window.skillsManager.secureSet(`registryToken:${name}`, registryToken.value)
  registryProfiles.value = [
    ...registryProfiles.value.filter((p) => p.name !== name),
    { name, url: registryUrl.value.trim() },
  ]
  profileName.value = ''
}

async function useProfile(profile: RegistryProfile): Promise<void> {
  registryUrl.value = profile.url
  registryToken.value = await window.skillsManager.secureGet(`registryToken:${profile.name}`)
  registryTestResult.value = null
}

async function removeProfile(profile: RegistryProfile): Promise<void> {
  registryProfiles.value = registryProfiles.value.filter((p) => p.name !== profile.name)
  await window.skillsManager.secureSet(`registryToken:${profile.name}`, '')
}

/* data：配置导出 / 导入 / 重置 */
function collectLocalConfig(): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
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

async function importConfig(): Promise<void> {
  const content = await window.skillsManager.importConfig()
  if (content === null) return
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const keys = Object.keys(parsed).filter((key) => key.startsWith('skm.'))
    if (keys.length === 0) throw new Error('empty')
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
  for (const key of Object.keys(collectLocalConfig())) localStorage.removeItem(key)
  location.reload()
}

/* about：版本、更新检查与诊断 */
const appInfo = ref<AppInfo | null>(null)
onMounted(async () => {
  appInfo.value = await window.skillsManager.getAppInfo()
})

const updateChecking = ref(false)
const updateResult = ref<UpdateCheckResult | null>(null)

async function checkUpdate(): Promise<void> {
  updateChecking.value = true
  updateResult.value = null
  try {
    updateResult.value = await window.skillsManager.checkUpdate()
  } finally {
    updateChecking.value = false
  }
}

function openReleasePage(): void {
  if (updateResult.value?.status === 'update') {
    void window.skillsManager.openLink(updateResult.value.url)
  }
}

function openUserData(): void {
  void window.skillsManager.openUserData()
}

async function copyDiagnostics(): Promise<void> {
  const info = appInfo.value
  const lines = [
    `SkillBuddy ${info?.version ?? '?'} (${info?.platform ?? '?'} ${info?.arch ?? ''})`.trim(),
    `Electron ${info?.electron ?? '?'} / Chromium ${info?.chrome ?? '?'} / Node ${info?.node ?? '?'}`,
    `Platforms: ${platforms.value.map((p) => `${p.id}${p.detected ? '' : ' (not detected)'}`).join(', ') || 'none'}`,
    `Project roots: ${projectRoots.value.length}`,
  ]
  await navigator.clipboard.writeText(lines.join('\n'))
  showToast({ message: t('settings.aboutDiagCopied') })
}
</script>

<template>
  <div class="flex h-screen">
    <!-- settings sidebar -->
    <aside class="sidebar-surface flex w-[276px] shrink-0 flex-col">
      <div class="app-drag px-4 pb-2 pt-10">
        <button
          type="button"
          class="app-no-drag flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          @click="emit('back')"
        >
          <ArrowLeft class="size-4" />
          {{ t('settings.back') }}
        </button>
      </div>
      <div class="px-4 pb-2">
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input v-model="query" :placeholder="t('settings.searchPh')" class="h-8 pl-8 text-sm" />
        </div>
      </div>

      <ScrollArea class="flex-1">
        <nav class="flex flex-col gap-0.5 px-3 pb-4">
          <template v-for="group in groups" :key="group.labelKey">
          <p
            class="mb-1 mt-4 px-2 text-sm font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ t(group.labelKey) }}
          </p>
          <button
            v-for="item in group.items"
            :key="item.id"
            :class="[
              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              !searching && category === item.id ? 'nav-active' : 'hover:bg-accent/60',
            ]"
            @click="((category = item.id), (query = ''))"
          >
            <component :is="item.icon" class="size-4 text-foreground/70" />
            {{ t(item.labelKey) }}
          </button>
          </template>
        </nav>
      </ScrollArea>
    </aside>

    <!-- content -->
    <ScrollArea class="content-surface min-w-0 flex-1">
      <main>
        <div class="mx-auto max-w-3xl px-10 py-10">
        <h1 class="mb-8 text-2xl font-semibold tracking-tight">{{ activeTitle }}</h1>

        <!-- general -->
        <section v-if="showCat('general')" class="mb-10">
          <h2 v-if="searching" class="mb-3 text-sm font-medium">{{ t('settings.catGeneral') }}</h2>
          <h2 v-else class="mb-3 text-sm font-medium">{{ t('settings.sectionLanguage') }}</h2>
          <div class="divide-y rounded-xl border">
            <div
              v-if="visible(t('settings.languageTitle'), t('settings.languageDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.languageTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.languageDesc') }}</p>
              </div>
              <Select
                v-model="language"
                class="w-36 shrink-0"
                :options="[
                  { value: 'zh-CN', label: '中文' },
                  { value: 'en', label: 'English' },
                ]"
              />
            </div>
            <div
              v-if="visible(t('settings.linkOpenTitle'), t('settings.linkOpenDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.linkOpenTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.linkOpenDesc') }}</p>
              </div>
              <Select
                v-model="linkOpenMode"
                class="w-36 shrink-0"
                :options="[
                  { value: 'external', label: t('settings.linkOpenExternal') },
                  { value: 'in-app', label: t('settings.linkOpenInApp') },
                ]"
              />
            </div>
          </div>
        </section>

        <!-- appearance -->
        <section
          v-if="
            showCat('appearance') &&
            visible(
              t('settings.sectionTheme'),
              t('settings.themeTitle'),
              t('settings.appearanceAccent'),
              t('settings.appearanceBackground'),
              t('settings.appearanceForeground'),
              t('settings.appearanceTranslucent'),
              t('settings.appearanceContrast'),
            )
          "
          class="mb-10"
        >
          <h2 class="mb-4 text-sm font-medium">{{ t('settings.sectionTheme') }}</h2>
          <ThemeModeCards v-model="theme" />
          <div class="mt-5">
            <ThemeCodePreview :mode="effectiveMode" />
          </div>
          <div class="mt-5">
            <ThemeStylePanel :mode="effectiveMode" />
          </div>
        </section>

        <!-- behavior -->
        <section v-if="showCat('behavior')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.catBehavior') }}</h2>
          <div class="divide-y rounded-xl border">
            <div
              v-if="visible(t('settings.autoRefreshTitle'), t('settings.autoRefreshDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.autoRefreshTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.autoRefreshDesc') }}
                </p>
              </div>
              <Switch v-model="autoRefresh" />
            </div>
            <div
              v-if="visible(t('settings.notifyDriftTitle'), t('settings.notifyDriftDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.notifyDriftTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.notifyDriftDesc') }}
                </p>
              </div>
              <Switch v-model="notifyDrift" />
            </div>
            <div
              v-if="visible(t('settings.defaultScopeTitle'), t('settings.defaultScopeDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.defaultScopeTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.defaultScopeDesc') }}
                </p>
              </div>
              <Select
                v-model="defaultInstallScope"
                class="w-44 shrink-0"
                :options="[
                  { value: 'user', label: t('settings.defaultScopeUser') },
                  { value: 'project', label: t('settings.defaultScopeProject') },
                ]"
              />
            </div>
            <div
              v-if="visible(t('settings.confirmUninstallTitle'), t('settings.confirmUninstallDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.confirmUninstallTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.confirmUninstallDesc') }}
                </p>
              </div>
              <Switch v-model="confirmUninstall" />
            </div>
            <div
              v-if="visible(t('settings.launchAtLoginTitle'), t('settings.launchAtLoginDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.launchAtLoginTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.launchAtLoginDesc') }}
                </p>
              </div>
              <Switch v-model="launchAtLogin" />
            </div>
            <div
              v-if="visible(t('settings.shortcutTitle'), t('settings.shortcutDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.shortcutTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.shortcutDesc') }}</p>
                <p v-if="globalShortcut && !globalShortcutOk" class="mt-0.5 text-sm text-destructive">
                  {{ t('settings.shortcutInvalid') }}
                </p>
              </div>
              <Input
                v-model="globalShortcut"
                class="w-64 shrink-0 font-mono text-sm"
                :placeholder="t('settings.shortcutPh')"
              />
            </div>
          </div>
        </section>

        <!-- registry -->
        <section v-if="showCat('registry')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.sectionRegistry') }}</h2>
          <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.registryDesc') }}</p>
          <div class="divide-y rounded-xl border">
            <div
              v-if="visible(t('settings.registryUrlTitle'))"
              class="flex flex-col gap-2 px-5 py-4"
            >
              <p class="text-sm font-medium">{{ t('settings.registryUrlTitle') }}</p>
              <Input
                v-model="registryUrl"
                class="text-sm"
                :placeholder="t('settings.registryUrlPh')"
              />
            </div>
            <div
              v-if="visible(t('settings.registryTokenTitle'))"
              class="flex flex-col gap-2 px-5 py-4"
            >
              <p class="text-sm font-medium">{{ t('settings.registryTokenTitle') }}</p>
              <Input
                v-model="registryToken"
                type="password"
                class="text-sm"
                :placeholder="t('settings.registryTokenPh')"
              />
            </div>
            <div v-if="visible(t('settings.registryTest'))" class="flex flex-col gap-2 px-5 py-4">
              <div class="flex items-center justify-between gap-6">
                <p class="text-sm font-medium">{{ t('settings.registryTest') }}</p>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="registryTesting || !registryUrl.trim()"
                  @click="testRegistry"
                >
                  {{ registryTesting ? t('settings.registryTesting') : t('settings.registryTest') }}
                </Button>
              </div>
              <p
                v-if="registryTestResult"
                :class="[
                  'text-sm',
                  registryTestResult.ok && registryTestResult.authOk
                    ? 'text-muted-foreground'
                    : 'text-destructive',
                ]"
              >
                <template v-if="registryTestResult.ok && registryTestResult.authOk">
                  {{
                    t('settings.registryTestOk', {
                      ms: registryTestResult.latencyMs,
                      orgs: registryTestResult.orgs.join(', ') || '—',
                    })
                  }}
                </template>
                <template v-else-if="registryTestResult.ok">
                  {{ t('settings.registryTestAuthFail', { ms: registryTestResult.latencyMs }) }}
                </template>
                <template v-else>
                  {{ t('settings.registryTestFail', { msg: registryTestResult.error ?? '' }) }}
                </template>
              </p>
            </div>
            <div
              v-if="visible(t('settings.registryProfilesTitle'))"
              class="flex flex-col gap-2 px-5 py-4"
            >
              <p class="text-sm font-medium">{{ t('settings.registryProfilesTitle') }}</p>
              <p class="text-sm text-muted-foreground">{{ t('settings.registryProfilesDesc') }}</p>
              <div
                v-for="profile in registryProfiles"
                :key="profile.name"
                class="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ profile.name }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ profile.url }}</p>
                </div>
                <span class="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" @click="useProfile(profile)">
                    {{ t('settings.registryUseProfile') }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7 text-muted-foreground"
                    @click="removeProfile(profile)"
                  >
                    <Trash2 class="size-3.5" />
                  </Button>
                </span>
              </div>
              <div class="flex items-center gap-2">
                <Input
                  v-model="profileName"
                  class="h-8 flex-1 text-sm"
                  :placeholder="t('settings.registryProfileNamePh')"
                />
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!profileName.trim() || !registryUrl.trim()"
                  @click="saveProfile"
                >
                  {{ t('settings.registrySaveProfile') }}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <!-- platforms -->
        <section v-if="showCat('platforms')" class="mb-10">
          <div class="mb-3 flex items-center justify-between gap-6">
            <h2 class="text-sm font-medium">{{ t('settings.sectionPlatforms') }}</h2>
            <Button variant="outline" size="sm" @click="showForm = !showForm">
              <Plus />
              {{ t('settings.customPlatform') }}
            </Button>
          </div>
          <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.platformsDesc') }}</p>

          <div v-if="showForm" class="mb-3 flex flex-col gap-2 rounded-xl border px-5 py-4">
            <div class="grid grid-cols-2 gap-2">
              <Input v-model="form.id" :placeholder="t('settings.formIdPh')" class="text-sm" />
              <Input
                v-model="form.displayName"
                :placeholder="t('settings.formNamePh')"
                class="text-sm"
              />
            </div>
            <Input
              v-model="form.detectPath"
              :placeholder="t('settings.formDetectPh')"
              class="text-sm"
            />
            <Input
              v-model="form.userSkillsDir"
              :placeholder="t('settings.formUserDirPh')"
              class="text-sm"
            />
            <Input
              v-model="form.projectSkillsDir"
              :placeholder="t('settings.formProjectDirPh')"
              class="text-sm"
            />
            <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" size="sm" @click="showForm = false">
                {{ t('common.cancel') }}
              </Button>
              <Button size="sm" @click="addCustomPlatform">{{ t('common.add') }}</Button>
            </div>
          </div>

          <div class="divide-y rounded-xl border">
            <div
              v-for="p in platforms.filter((pf) => visible(pf.displayName, pf.id))"
              :key="p.id"
              class="flex items-center justify-between gap-2 px-5 py-3"
            >
              <div class="flex min-w-0 items-center gap-2.5">
                <PlatformIcon :id="p.id" :size="16" />
                <span class="text-sm">{{ p.displayName }}</span>
                <Badge :variant="p.detected ? 'success' : 'secondary'">
                  {{ p.detected ? t('settings.detected') : t('settings.notDetected') }}
                </Badge>
              </div>
              <Button
                v-if="customPlatforms.some((c) => c.id === p.id)"
                variant="ghost"
                size="icon"
                class="size-7 shrink-0 text-muted-foreground"
                :title="t('settings.removeNote')"
                @click="removeCustomPlatform(p.id)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </section>

        <!-- network -->
        <section v-if="showCat('network')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.catNetwork') }}</h2>
          <div class="divide-y rounded-xl border">
            <div
              v-if="visible(t('settings.githubTokenTitle'), t('settings.githubTokenDesc'))"
              class="flex flex-col gap-2 px-5 py-4"
            >
              <p class="text-sm font-medium">{{ t('settings.githubTokenTitle') }}</p>
              <p class="text-sm text-muted-foreground">{{ t('settings.githubTokenDesc') }}</p>
              <Input
                v-model="githubToken"
                type="password"
                class="text-sm"
                :placeholder="t('settings.githubTokenPh')"
              />
            </div>
            <div
              v-if="visible(t('settings.proxyTitle'), t('settings.proxyDesc'))"
              class="flex flex-col gap-2 px-5 py-4"
            >
              <p class="text-sm font-medium">{{ t('settings.proxyTitle') }}</p>
              <p class="text-sm text-muted-foreground">{{ t('settings.proxyDesc') }}</p>
              <Input
                v-model="proxyUrl"
                class="text-sm"
                :placeholder="t('settings.proxyPh')"
              />
            </div>
          </div>
        </section>

        <!-- projects -->
        <section v-if="showCat('projects')" class="mb-10">
          <div class="mb-3 flex items-center justify-between gap-6">
            <h2 class="text-sm font-medium">{{ t('settings.sectionProjects') }}</h2>
            <Button variant="outline" size="sm" @click="addProjectRoot">
              <FolderPlus />
              {{ t('common.add') }}
            </Button>
          </div>
          <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.projectDirsDesc') }}</p>
          <p
            v-if="projectRoots.length === 0"
            class="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground"
          >
            {{ t('settings.noDirs') }}
          </p>
          <div v-else class="divide-y rounded-xl border">
            <div
              v-for="root in projectRoots.filter((r) => visible(r))"
              :key="root"
              class="flex items-center justify-between gap-2 px-5 py-3"
            >
              <code class="select-text truncate text-sm">{{ root }}</code>
              <span class="flex shrink-0 items-center gap-0.5">
                <CopyButton :text="root" class="size-7" />
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground"
                  @click="removeProjectRoot(root)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </span>
            </div>
          </div>
        </section>

        <!-- data -->
        <section v-if="showCat('data')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.catData') }}</h2>
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
              <Button variant="outline" size="sm" class="shrink-0" @click="exportConfig">
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
              <Button variant="outline" size="sm" class="shrink-0" @click="importConfig">
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
                class="shrink-0 text-destructive"
                @click="resetConfig"
              >
                {{ t('settings.dataResetAction') }}
              </Button>
            </div>
          </div>
        </section>

        <!-- about -->
        <section v-if="showCat('about')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.catAbout') }}</h2>
          <div class="divide-y rounded-xl border">
            <div
              v-if="visible(t('settings.aboutVersionTitle'), t('settings.aboutCheckUpdate'))"
              class="flex flex-col gap-2 px-5 py-4"
            >
              <div class="flex items-center justify-between gap-6">
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    :src="skillbuddyMarkUrl"
                    alt=""
                    class="size-9 shrink-0"
                    aria-hidden="true"
                  />
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ t('settings.aboutVersionTitle') }}</p>
                    <p class="mt-0.5 text-sm text-muted-foreground">
                      SkillBuddy v{{ appInfo?.version ?? '…' }}
                    </p>
                  </div>
                </div>
                <span class="flex shrink-0 items-center gap-2">
                  <Button v-if="updateResult?.status === 'update'" size="sm" @click="openReleasePage">
                    {{ t('settings.aboutDownload') }}
                  </Button>
                  <Button variant="outline" size="sm" :disabled="updateChecking" @click="checkUpdate">
                    {{ updateChecking ? t('settings.aboutChecking') : t('settings.aboutCheckUpdate') }}
                  </Button>
                </span>
              </div>
              <p v-if="updateResult" class="text-sm text-muted-foreground">
                <template v-if="updateResult.status === 'update'">
                  {{ t('settings.aboutUpdateAvailable', { v: updateResult.latest }) }}
                </template>
                <template v-else-if="updateResult.status === 'latest'">
                  {{ t('settings.aboutUpToDate', { v: appInfo?.version ?? '' }) }}
                </template>
                <template v-else-if="updateResult.status === 'none'">
                  {{ t('settings.aboutNoRelease') }}
                </template>
                <template v-else>
                  {{ t('settings.aboutCheckFailed', { msg: updateResult.message }) }}
                </template>
              </p>
            </div>
            <div
              v-if="visible(t('settings.aboutRuntimeTitle'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.aboutRuntimeTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  Electron {{ appInfo?.electron }} · Chromium {{ appInfo?.chrome }} · Node
                  {{ appInfo?.node }}
                </p>
              </div>
              <Button variant="outline" size="sm" class="shrink-0" @click="copyDiagnostics">
                {{ t('settings.aboutCopyDiagnostics') }}
              </Button>
            </div>
            <div
              v-if="visible(t('settings.aboutOpenDataTitle'), t('settings.aboutOpenDataDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.aboutOpenDataTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.aboutOpenDataDesc') }}
                </p>
              </div>
              <Button variant="outline" size="sm" class="shrink-0" @click="openUserData">
                {{ t('settings.aboutOpenDataAction') }}
              </Button>
            </div>
          </div>
        </section>
        </div>
      </main>
    </ScrollArea>
  </div>
</template>
