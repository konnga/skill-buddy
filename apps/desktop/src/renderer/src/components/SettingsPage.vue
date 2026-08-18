<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Blocks,
  Database,
  FolderGit2,
  FolderPlus,
  GitBranch,
  Globe,
  Info,
  Palette,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Users,
} from '@lucide/vue'
import type { PlatformStatus } from '@skillbuddy/core'
import {
  type CustomPlatformInput,
  type TeamLibraryConfig,
} from '../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../shared/team-library.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import CopyButton from '@/components/CopyButton.vue'
import ThemeCodePreview from '@/components/appearance/ThemeCodePreview.vue'
import ThemeModeCards from '@/components/appearance/ThemeModeCards.vue'
import ThemeStylePanel from '@/components/appearance/ThemeStylePanel.vue'
import SettingsAboutSection from '@/components/settings/SettingsAboutSection.vue'
import SettingsDataSection from '@/components/settings/SettingsDataSection.vue'
import TeamLibrarySetupPanel from '@/components/settings/TeamLibrarySetupPanel.vue'
import SettingsPlatformsSection, {
  type CustomPlatformForm,
} from '@/components/settings/SettingsPlatformsSection.vue'
import SettingsSidebar, { type SettingsNavGroup } from '@/components/settings/SettingsSidebar.vue'
import { useSettings, syncCustomPlatforms } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeamLibraries } from '@/composables/useTeamLibraries'
import type { SettingsCategory } from '@/lib/navigation'

const props = defineProps<{ initialCategory?: SettingsCategory }>()
const emit = defineEmits<{ back: [] }>()

const {
  projectRoots,
  customPlatforms,
  theme,
  language,
  githubToken,
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
} = useSettings()
const { t } = useI18n()
const { platforms, refresh } = useSkills()
const { catalogs: teamLibraryCatalogs, errors: teamLibraryErrors, warnings: teamLibraryWarnings } = useTeamLibraries()

const category = shallowRef<SettingsCategory>(props.initialCategory ?? 'general')
const query = shallowRef('')

const groups: SettingsNavGroup[] = [
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
      { id: 'team-library', labelKey: 'settings.catTeamLibrary', icon: Users },
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

const visiblePlatforms = computed<PlatformStatus[]>(() =>
  platforms.value.filter((platform) => visible(platform.displayName, platform.id)),
)

/** Show a category's content when selected, or always while searching. */
function showCat(id: SettingsCategory): boolean {
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
const showForm = shallowRef(false)
const form = ref<CustomPlatformForm>({
  id: '',
  displayName: '',
  userSkillsDir: '',
  projectSkillsDir: '',
  detectPath: '',
})
const formError = shallowRef<string | null>(null)

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

function repositoryLabel(remoteUrl: string): string {
  return remoteUrl.replace(/\/$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') || remoteUrl
}

const teamLibraryRows = computed(() => teamLibraries.value.map((library) => {
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
}))

function addTeamLibrary(library: TeamLibraryConfig): void {
  teamLibraries.value = [
    ...teamLibraries.value.filter(
      (item) => item.remoteUrl.trim() !== library.remoteUrl.trim(),
    ),
    library,
  ]
}

function removeTeamLibrary(key: string): void {
  teamLibraries.value = teamLibraries.value.filter(
    (library) => teamLibraryConfigKey(library) !== key,
  )
}

</script>

<template>
  <div class="flex h-screen">
    <SettingsSidebar
      :groups="groups"
      :category="category"
      :query="query"
      :searching="searching"
      @back="emit('back')"
      @update:category="category = $event"
      @update:query="query = $event"
    />
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
              v-if="visible(t('settings.backgroundModeTitle'), t('settings.backgroundModeDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.backgroundModeTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.backgroundModeDesc') }}
                </p>
              </div>
              <Switch v-model="backgroundMode" :disabled="!desktopPreferencesReady" />
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
              <Switch v-model="launchAtLogin" :disabled="!launchAtLoginReady" />
            </div>
            <div
              v-if="visible(t('settings.launchHiddenTitle'), t('settings.launchHiddenDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.launchHiddenTitle') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('settings.launchHiddenDesc') }}
                </p>
              </div>
              <Switch
                v-model="launchHidden"
                :disabled="
                  !desktopPreferencesReady ||
                  !launchAtLoginReady ||
                  !backgroundMode ||
                  !launchAtLogin
                "
              />
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

        <!-- team library -->
        <section v-if="showCat('team-library')" class="mb-10">
          <h2 v-if="searching" class="mb-3 text-sm font-medium">
            {{ t('settings.sectionTeamLibrary') }}
          </h2>
          <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.teamLibraryDesc') }}</p>
          <div class="space-y-4">
            <div v-if="teamLibraryRows.length > 0" class="divide-y rounded-xl border">
              <div
                v-for="library in teamLibraryRows"
                :key="library.key"
                class="flex items-center gap-3 px-4 py-3.5"
              >
                <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <GitBranch class="size-4 text-muted-foreground" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 items-center gap-2">
                    <p class="truncate text-sm font-medium">{{ library.name }}</p>
                    <Badge v-if="library.id" variant="secondary" class="shrink-0 font-mono text-[10px]">
                      {{ library.id }}
                    </Badge>
                  </div>
                  <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {{ library.config.remoteUrl }}
                  </p>
                  <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch class="size-3" />
                    {{ library.config.branch }}
                  </p>
                  <p v-if="library.error" class="mt-1 break-all text-xs text-destructive">
                    {{ library.error }}
                  </p>
                  <p v-else-if="library.warning" class="mt-1 break-all text-xs text-amber-600 dark:text-amber-400">
                    {{ library.warning }}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  :title="t('settings.teamLibraryRemove')"
                  :aria-label="t('settings.teamLibraryRemove')"
                  @click="removeTeamLibrary(library.key)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <TeamLibrarySetupPanel @connected="addTeamLibrary" />
          </div>
        </section>

        <SettingsPlatformsSection
          v-if="showCat('platforms')"
          :platforms="visiblePlatforms"
          :custom-platforms="customPlatforms"
          :show-form="showForm"
          :form="form"
          :form-error="formError"
          @update:showForm="showForm = $event"
          @update:form="form = $event"
          @add="addCustomPlatform"
          @remove="removeCustomPlatform"
        />
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

        <SettingsDataSection v-if="showCat('data')" :query="query" />

        <SettingsAboutSection v-if="showCat('about')" :query="query" />
        </div>
      </main>
    </ScrollArea>
  </div>
</template>
