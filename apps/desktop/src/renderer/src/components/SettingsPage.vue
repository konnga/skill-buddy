<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  Blocks,
  FolderGit2,
  FolderPlus,
  Palette,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
} from '@lucide/vue'
import type { CustomPlatformInput } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import CopyButton from '@/components/CopyButton.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { useSettings, syncCustomPlatforms } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const emit = defineEmits<{ back: [] }>()

const { projectRoots, customPlatforms, theme, language, registryUrl, registryToken } =
  useSettings()
const { t } = useI18n()
const { platforms, refresh } = useSkills()

type Category = 'general' | 'appearance' | 'registry' | 'platforms' | 'projects'
const category = ref<Category>('general')
const query = ref('')

const groups: { labelKey: string; items: { id: Category; labelKey: string; icon: unknown }[] }[] =
  [
    {
      labelKey: 'settings.groupPersonal',
      items: [
        { id: 'general', labelKey: 'settings.catGeneral', icon: Settings2 },
        { id: 'appearance', labelKey: 'settings.catAppearance', icon: Palette },
      ],
    },
    {
      labelKey: 'settings.groupIntegrations',
      items: [
        { id: 'registry', labelKey: 'settings.catRegistry', icon: Users },
        { id: 'platforms', labelKey: 'settings.catPlatforms', icon: Blocks },
      ],
    },
    {
      labelKey: 'settings.groupWorkspace',
      items: [{ id: 'projects', labelKey: 'settings.catProjects', icon: FolderGit2 }],
    },
  ]

const searching = computed(() => query.value.trim().length > 0)

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
</script>

<template>
  <div class="flex h-screen">
    <!-- settings sidebar -->
    <aside class="flex w-64 shrink-0 flex-col border-r bg-muted/30">
      <div class="app-drag px-4 pb-2 pt-10">
        <button
          class="app-no-drag flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
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

      <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
        <template v-for="group in groups" :key="group.labelKey">
          <p
            class="mb-1 mt-4 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
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
    </aside>

    <!-- content -->
    <main class="min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-3xl px-10 py-10">
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
                <p class="mt-0.5 text-xs text-muted-foreground">{{ t('settings.languageDesc') }}</p>
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
          </div>
        </section>

        <!-- appearance -->
        <section v-if="showCat('appearance')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.sectionTheme') }}</h2>
          <div class="divide-y rounded-xl border">
            <div
              v-if="visible(t('settings.themeTitle'), t('settings.themeDesc'))"
              class="flex items-center justify-between gap-6 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('settings.themeTitle') }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">{{ t('settings.themeDesc') }}</p>
              </div>
              <Select
                v-model="theme"
                class="w-36 shrink-0"
                :options="[
                  { value: 'system', label: t('settings.themeSystem') },
                  { value: 'light', label: t('settings.themeLight') },
                  { value: 'dark', label: t('settings.themeDark') },
                ]"
              />
            </div>
          </div>
        </section>

        <!-- registry -->
        <section v-if="showCat('registry')" class="mb-10">
          <h2 class="mb-3 text-sm font-medium">{{ t('settings.sectionRegistry') }}</h2>
          <p class="mb-3 text-xs text-muted-foreground">{{ t('settings.registryDesc') }}</p>
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
          <p class="mb-3 text-xs text-muted-foreground">{{ t('settings.platformsDesc') }}</p>

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
            <p v-if="formError" class="text-xs text-destructive">{{ formError }}</p>
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

        <!-- projects -->
        <section v-if="showCat('projects')" class="mb-10">
          <div class="mb-3 flex items-center justify-between gap-6">
            <h2 class="text-sm font-medium">{{ t('settings.sectionProjects') }}</h2>
            <Button variant="outline" size="sm" @click="addProjectRoot">
              <FolderPlus />
              {{ t('common.add') }}
            </Button>
          </div>
          <p class="mb-3 text-xs text-muted-foreground">{{ t('settings.projectDirsDesc') }}</p>
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
              <code class="select-text truncate text-xs">{{ root }}</code>
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
      </div>
    </main>
  </div>
</template>
