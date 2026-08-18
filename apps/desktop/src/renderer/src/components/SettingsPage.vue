<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Blocks,
  Database,
  FolderGit2,
  Globe,
  Info,
  Palette,
  Settings2,
  SlidersHorizontal,
  Users,
} from '@lucide/vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import SettingsAboutSection from '@/components/settings/SettingsAboutSection.vue'
import SettingsAppearanceSection from '@/components/settings/SettingsAppearanceSection.vue'
import SettingsBehaviorSection from '@/components/settings/SettingsBehaviorSection.vue'
import SettingsDataSection from '@/components/settings/SettingsDataSection.vue'
import SettingsGeneralSection from '@/components/settings/SettingsGeneralSection.vue'
import SettingsNetworkSection from '@/components/settings/SettingsNetworkSection.vue'
import SettingsPlatformsSection from '@/components/settings/SettingsPlatformsSection.vue'
import SettingsProjectsSection from '@/components/settings/SettingsProjectsSection.vue'
import SettingsSidebar, { type SettingsNavGroup } from '@/components/settings/SettingsSidebar.vue'
import SettingsTeamLibrarySection from '@/components/settings/SettingsTeamLibrarySection.vue'
import { useSettingsPageSections } from '@/composables/useSettingsPageSections'
import type { SettingsCategory } from '@/lib/navigation'

const props = defineProps<{ initialCategory?: SettingsCategory }>()
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()

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
  const item = groups.flatMap((group) => group.items).find(({ id }) => id === category.value)
  return item ? t(item.labelKey) : ''
})

/** 搜索时并列展示全部分类，否则只挂载当前分类。 */
function showCategory(id: SettingsCategory): boolean {
  return searching.value || category.value === id
}

const {
  projectRoots,
  customPlatforms,
  theme,
  language,
  githubToken,
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
} = useSettingsPageSections({ query })
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

    <ScrollArea class="content-surface min-w-0 flex-1">
      <main>
        <div class="mx-auto max-w-3xl px-10 py-10">
          <h1 class="mb-8 text-2xl font-semibold tracking-tight">{{ activeTitle }}</h1>

          <SettingsGeneralSection
            v-if="showCategory('general')"
            v-model:language="language"
            v-model:link-open-mode="linkOpenMode"
            :query="query"
            :searching="searching"
          />

          <SettingsAppearanceSection
            v-if="showCategory('appearance')"
            v-model:theme="theme"
            :query="query"
            :effective-mode="effectiveMode"
          />

          <SettingsBehaviorSection
            v-if="showCategory('behavior')"
            v-model:auto-refresh="autoRefresh"
            v-model:notify-drift="notifyDrift"
            v-model:confirm-uninstall="confirmUninstall"
            v-model:background-mode="backgroundMode"
            v-model:launch-at-login="launchAtLogin"
            v-model:launch-hidden="launchHidden"
            v-model:global-shortcut="globalShortcut"
            :query="query"
            :global-shortcut-ok="globalShortcutOk"
            :launch-at-login-ready="launchAtLoginReady"
            :desktop-preferences-ready="desktopPreferencesReady"
          />

          <SettingsTeamLibrarySection
            v-if="showCategory('team-library')"
            :searching="searching"
            :rows="teamLibraryRows"
            @connected="addTeamLibrary"
            @remove="removeTeamLibrary"
          />

          <SettingsPlatformsSection
            v-if="showCategory('platforms')"
            :platforms="visiblePlatforms"
            :custom-platforms="customPlatforms"
            :show-form="showPlatformForm"
            :form="platformForm"
            :form-error="platformFormError"
            @update:showForm="showPlatformForm = $event"
            @update:form="platformForm = $event"
            @add="addCustomPlatform"
            @remove="removeCustomPlatform"
          />

          <SettingsNetworkSection
            v-if="showCategory('network')"
            v-model:github-token="githubToken"
            v-model:proxy-url="proxyUrl"
            :query="query"
          />

          <SettingsProjectsSection
            v-if="showCategory('projects')"
            :query="query"
            :roots="projectRoots"
            @add="addProjectRoot"
            @remove="removeProjectRoot"
          />

          <SettingsDataSection v-if="showCategory('data')" :query="query" />
          <SettingsAboutSection v-if="showCategory('about')" :query="query" />
        </div>
      </main>
    </ScrollArea>
  </div>
</template>
