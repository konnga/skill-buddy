<script setup lang="ts">
import { ref } from 'vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { FolderPlus, Monitor, Moon, Plus, Sun, Trash2, X } from '@lucide/vue'
import type { CustomPlatformInput } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { useSettings, syncCustomPlatforms, type ThemeMode } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { projectRoots, customPlatforms, theme } = useSettings()
const { platforms, refresh } = useSkills()

const themeOptions: { value: ThemeMode; label: string; icon: unknown }[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon },
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
    formError.value = 'ID 需为 kebab-case（如 my-agent）'
    return
  }
  if (!f.displayName || !f.detectPath || !f.userSkillsDir) {
    formError.value = '名称、检测路径、user 级目录为必填'
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
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-[92vw] flex-col border-l bg-background shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <header class="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle class="text-base font-semibold tracking-tight">设置</DialogTitle>
          <Button variant="ghost" size="icon" @click="emit('close')"><X /></Button>
        </header>

        <div class="flex-1 overflow-y-auto">
          <!-- theme -->
          <section class="border-b px-6 py-4">
            <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              外观
            </h3>
            <div class="flex gap-2">
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                type="button"
                :class="[
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  theme === opt.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'hover:border-foreground/40',
                ]"
                @click="theme = opt.value"
              >
                <component :is="opt.icon" class="size-3.5" />
                {{ opt.label }}
              </button>
            </div>
          </section>

          <!-- project roots -->
          <section class="border-b px-6 py-4">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                项目目录（扫描 project 级 skills）
              </h3>
              <Button variant="outline" size="sm" @click="addProjectRoot">
                <FolderPlus />
                添加
              </Button>
            </div>
            <p v-if="projectRoots.length === 0" class="text-xs text-muted-foreground">
              未添加项目目录。添加后将扫描各平台在项目内的 skills（如
              <code>.claude/skills</code>）。
            </p>
            <ul v-else class="flex flex-col gap-1.5">
              <li
                v-for="root in projectRoots"
                :key="root"
                class="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5"
              >
                <code class="truncate text-xs">{{ root }}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7 shrink-0 text-muted-foreground"
                  @click="removeProjectRoot(root)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </li>
            </ul>
          </section>

          <!-- platforms -->
          <section class="px-6 py-4">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                平台
              </h3>
              <Button variant="outline" size="sm" @click="showForm = !showForm">
                <Plus />
                自定义平台
              </Button>
            </div>

            <div v-if="showForm" class="mb-3 flex flex-col gap-2 rounded-md border px-3 py-3">
              <div class="grid grid-cols-2 gap-2">
                <Input v-model="form.id" placeholder="id（kebab-case）" class="text-sm" />
                <Input v-model="form.displayName" placeholder="显示名称" class="text-sm" />
              </div>
              <Input
                v-model="form.detectPath"
                placeholder="检测路径，如 ~/.my-agent"
                class="text-sm"
              />
              <Input
                v-model="form.userSkillsDir"
                placeholder="user 级 skills 目录，如 ~/.my-agent/skills"
                class="text-sm"
              />
              <Input
                v-model="form.projectSkillsDir"
                placeholder="project 级目录（可选），如 .my-agent/skills"
                class="text-sm"
              />
              <p v-if="formError" class="text-xs text-destructive">{{ formError }}</p>
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="showForm = false">取消</Button>
                <Button size="sm" @click="addCustomPlatform">添加</Button>
              </div>
            </div>

            <ul class="flex flex-col gap-1.5">
              <li
                v-for="p in platforms"
                :key="p.id"
                class="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <PlatformIcon :id="p.id" :size="15" />
                  <span class="text-sm">{{ p.displayName }}</span>
                  <Badge :variant="p.detected ? 'success' : 'secondary'">
                    {{ p.detected ? '已检测到' : '未检测到' }}
                  </Badge>
                </div>
                <Button
                  v-if="customPlatforms.some((c) => c.id === p.id)"
                  variant="ghost"
                  size="icon"
                  class="size-7 shrink-0 text-muted-foreground"
                  title="移除（重启后完全生效）"
                  @click="removeCustomPlatform(p.id)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
