<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  Blocks,
  FolderOpen,
  Globe,
  LayoutDashboard,
  PanelLeft,
  Settings,
  Trash2,
  Users,
} from '@lucide/vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { useGroups } from '@/composables/useGroups'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import type { WorkspaceView } from '@/lib/navigation'

const props = defineProps<{ view: WorkspaceView }>()
const emit = defineEmits<{
  navigate: [view: WorkspaceView]
  openSettings: []
}>()

const { t } = useI18n()
const { projectRoots, sidebarCollapsed } = useSettings()
const {
  detectedPlatforms,
  countByPlatform,
  countByProject,
  platformFilter,
  projectFilter,
  groupFilter,
  skills,
} = useSkills()
const { groups, filterGroup, deleteGroup } = useGroups()

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

function showAllSkills(): void {
  platformFilter.value = null
  projectFilter.value = null
  groupFilter.value = null
  emit('navigate', 'skills')
}

function filterPlatform(id: string): void {
  platformFilter.value = platformFilter.value === id ? null : id
  emit('navigate', 'skills')
}

function filterProject(root: string): void {
  projectFilter.value = projectFilter.value === root ? null : root
  emit('navigate', 'skills')
}

function selectGroup(name: string): void {
  filterGroup(name)
  emit('navigate', 'skills')
}
</script>

<template>
  <aside
    :class="[
      'sidebar-surface flex shrink-0 flex-col overflow-hidden transition-[width] duration-200',
      sidebarCollapsed ? 'w-0' : 'w-56',
    ]"
  >
    <div class="flex h-full w-56 shrink-0 flex-col">
      <div class="app-drag flex h-10 shrink-0 items-center">
        <button
          type="button"
          class="app-no-drag ml-[78px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          :title="`${t('app.toggleSidebar')} (⌘B)`"
          :aria-label="t('app.toggleSidebar')"
          @click="sidebarCollapsed = true"
        >
          <PanelLeft class="size-4" />
        </button>
      </div>
      <div class="flex items-center gap-2 px-4 py-3">
        <Blocks class="size-5 text-primary" />
        <span class="font-semibold tracking-tight">SkillBuddy</span>
      </div>

      <nav class="flex flex-col gap-0.5 px-2">
        <button
          type="button"
          :class="[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'dashboard' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="emit('navigate', 'dashboard')"
        >
          <LayoutDashboard class="size-4 text-foreground/70" />
          {{ t('dashboard.title') }}
        </button>
        <button
          type="button"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'skills' &&
            platformFilter === null &&
            projectFilter === null &&
            groupFilter === null
              ? 'nav-active'
              : 'hover:bg-accent/60',
          ]"
          @click="showAllSkills"
        >
          <span class="flex items-center gap-2">
            <Blocks class="size-4 text-foreground/70" />
            {{ t('dashboard.skillsNav') }}
          </span>
          <span class="text-xs tabular-nums text-muted-foreground">{{ skills.length }}</span>
        </button>
        <button
          type="button"
          :class="[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'team' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="emit('navigate', 'team')"
        >
          <Users class="size-4 text-foreground/70" />
          {{ t('team.title') }}
        </button>

        <p class="mb-1 mt-4 px-3 text-sm font-medium text-muted-foreground">
          {{ t('app.platforms') }}
        </p>
        <button
          v-for="platform in detectedPlatforms"
          :key="platform.id"
          type="button"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'skills' && platformFilter === platform.id
              ? 'nav-active'
              : 'hover:bg-accent/60',
          ]"
          @click="filterPlatform(platform.id)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <PlatformIcon :id="platform.id" :size="15" class="text-foreground/70" />
            <span class="truncate">{{ platform.displayName }}</span>
          </span>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ countByPlatform.get(platform.id) ?? 0 }}
          </span>
        </button>

        <template v-if="projectRoots.length > 0">
          <p class="mb-1 mt-4 px-3 text-sm font-medium text-muted-foreground">
            {{ t('app.scope') }}
          </p>
          <button
            type="button"
            :class="[
              'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              props.view === 'skills' && projectFilter === 'user'
                ? 'nav-active'
                : 'hover:bg-accent/60',
            ]"
            @click="filterProject('user')"
          >
            <span class="flex min-w-0 items-center gap-2">
              <Globe class="size-3.5 shrink-0 text-foreground/60" />
              <span class="truncate">{{ t('app.userGlobal') }}</span>
            </span>
          </button>
          <button
            v-for="root in projectRoots"
            :key="root"
            type="button"
            :class="[
              'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              props.view === 'skills' && projectFilter === root
                ? 'nav-active'
                : 'hover:bg-accent/60',
            ]"
            :title="root"
            @click="filterProject(root)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <FolderOpen class="size-3.5 shrink-0 text-foreground/60" />
              <span class="truncate">{{ basename(root) }}</span>
            </span>
            <span class="text-xs tabular-nums text-muted-foreground">
              {{ countByProject.get(root) ?? 0 }}
            </span>
          </button>
        </template>

        <template v-if="groups.length > 0">
          <p class="mb-1 mt-4 px-3 text-sm font-medium text-muted-foreground">
            {{ t('groups.title') }}
          </p>
          <div
            v-for="group in groups"
            :key="group.name"
            :class="[
              'group/g flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              props.view === 'skills' && groupFilter === group.name
                ? 'nav-active'
                : 'hover:bg-accent/60',
            ]"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center text-left"
              @click="selectGroup(group.name)"
            >
              <span class="truncate">{{ group.name }}</span>
            </button>
            <span class="flex shrink-0 items-center gap-1">
              <span class="text-xs tabular-nums text-muted-foreground">{{ group.skills.length }}</span>
              <button
                type="button"
                class="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover/g:inline-flex"
                :title="t('groups.deleteGroup')"
                :aria-label="t('groups.deleteGroup')"
                @click="deleteGroup(group.name)"
              >
                <Trash2 class="size-3" />
              </button>
            </span>
          </div>
        </template>
      </nav>

      <div class="mt-auto px-2 pb-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          @click="emit('openSettings')"
        >
          <Settings class="size-4" />
          {{ t('common.settings') }}
        </button>
      </div>
    </div>
  </aside>
</template>
