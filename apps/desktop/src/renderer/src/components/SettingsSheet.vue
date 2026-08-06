<script setup lang="ts">
import { ref } from 'vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import {
  Blocks,
  FolderGit2,
  FolderPlus,
  Plus,
  Settings2,
  Trash2,
  Users,
  X,
} from '@lucide/vue'
import type { CustomPlatformInput } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import CopyButton from '@/components/CopyButton.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { useI18n } from 'vue-i18n'
import { useSettings, syncCustomPlatforms } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { projectRoots, customPlatforms, theme, language, registryUrl, registryToken } =
  useSettings()
const { t } = useI18n()
const { platforms, refresh } = useSkills()

type Category = 'general' | 'registry' | 'projects' | 'platforms'
const category = ref<Category>('general')

const categories: { id: Category; labelKey: string; icon: unknown }[] = [
  { id: 'general', labelKey: 'settings.catGeneral', icon: Settings2 },
  { id: 'registry', labelKey: 'settings.catRegistry', icon: Users },
  { id: 'projects', labelKey: 'settings.catProjects', icon: FolderGit2 },
  { id: 'platforms', labelKey: 'settings.catPlatforms', icon: Blocks },
]

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
  // Registry keeps the adapter until restart; note shown in UI.
  await refresh()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[640px] max-h-[85vh] w-[880px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-background shadow-2xl outline-none"
        @open-auto-focus.prevent
      >
        <!-- left nav -->
        <aside class="flex w-52 shrink-0 flex-col gap-0.5 border-r bg-muted/40 p-3">
          <button
            v-for="c in categories"
            :key="c.id"
            :class="[
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              category === c.id ? 'bg-accent font-medium' : 'hover:bg-accent/60',
            ]"
            @click="category = c.id"
          >
            <component :is="c.icon" class="size-4 text-foreground/70" />
            {{ t(c.labelKey) }}
          </button>
        </aside>

        <!-- right panel -->
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex items-center justify-between px-7 py-5">
            <DialogTitle class="text-lg font-semibold tracking-tight">
              {{ t('settings.title') }}
            </DialogTitle>
            <Button variant="ghost" size="icon" @click="emit('close')"><X /></Button>
          </header>

          <div class="flex-1 overflow-y-auto px-7 pb-7">
            <!-- general -->
            <div v-if="category === 'general'" class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-6 rounded-lg border px-5 py-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ t('settings.languageTitle') }}</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {{ t('settings.languageDesc') }}
                  </p>
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

              <div class="flex items-center justify-between gap-6 rounded-lg border px-5 py-4">
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

            <!-- registry -->
            <div v-else-if="category === 'registry'" class="flex flex-col gap-3">
              <p class="text-xs text-muted-foreground">{{ t('settings.registryDesc') }}</p>
              <div class="flex flex-col gap-2 rounded-lg border px-5 py-4">
                <p class="text-sm font-medium">{{ t('settings.registryUrlTitle') }}</p>
                <Input
                  v-model="registryUrl"
                  class="text-sm"
                  :placeholder="t('settings.registryUrlPh')"
                />
              </div>
              <div class="flex flex-col gap-2 rounded-lg border px-5 py-4">
                <p class="text-sm font-medium">{{ t('settings.registryTokenTitle') }}</p>
                <Input
                  v-model="registryToken"
                  type="password"
                  class="text-sm"
                  :placeholder="t('settings.registryTokenPh')"
                />
              </div>
            </div>

            <!-- projects -->
            <div v-else-if="category === 'projects'" class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-6">
                <p class="text-xs text-muted-foreground">{{ t('settings.projectDirsDesc') }}</p>
                <Button variant="outline" size="sm" class="shrink-0" @click="addProjectRoot">
                  <FolderPlus />
                  {{ t('common.add') }}
                </Button>
              </div>
              <p
                v-if="projectRoots.length === 0"
                class="rounded-lg border border-dashed px-5 py-8 text-center text-sm text-muted-foreground"
              >
                {{ t('settings.noDirs') }}
              </p>
              <ul v-else class="flex flex-col gap-2">
                <li
                  v-for="root in projectRoots"
                  :key="root"
                  class="flex items-center justify-between gap-2 rounded-lg border px-5 py-3"
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
                </li>
              </ul>
            </div>

            <!-- platforms -->
            <div v-else class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-6">
                <p class="text-xs text-muted-foreground">{{ t('settings.platformsDesc') }}</p>
                <Button
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  @click="showForm = !showForm"
                >
                  <Plus />
                  {{ t('settings.customPlatform') }}
                </Button>
              </div>

              <div v-if="showForm" class="flex flex-col gap-2 rounded-lg border px-5 py-4">
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

              <ul class="flex flex-col gap-2">
                <li
                  v-for="p in platforms"
                  :key="p.id"
                  class="flex items-center justify-between gap-2 rounded-lg border px-5 py-3"
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
                </li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
