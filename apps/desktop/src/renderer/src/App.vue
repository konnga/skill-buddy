<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Blocks,
  FolderOpen,
  Import,
  LayoutDashboard,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Settings,
  TriangleAlert,
  Users,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import DashboardPage from '@/components/DashboardPage.vue'
import ImportSheet from '@/components/ImportSheet.vue'
import NewSkillSheet from '@/components/NewSkillSheet.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import SkillCard from '@/components/SkillCard.vue'
import SkillDetailPage from '@/components/SkillDetailPage.vue'
import TeamPage from '@/components/TeamPage.vue'
import { setPlatformNames } from '@/lib/agents'
import { syncCustomPlatforms, useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const {
  platforms,
  detectedPlatforms,
  countByPlatform,
  countByProject,
  loading,
  error,
  search,
  platformFilter,
  projectFilter,
  driftOnly,
  sortBy,
  filtered,
  skills,
  refresh,
} = useSkills()

const { projectRoots, sidebarCollapsed } = useSettings()
const { t } = useI18n()

const basename = (p: string): string => p.split('/').filter(Boolean).pop() ?? p

const sortOptions = computed(() => [
  { value: 'name', label: t('sort.name') },
  { value: 'recent', label: t('sort.recent') },
])

const selected = ref<AggregatedSkill | null>(null)
const newOpen = ref(false)
const importOpen = ref(false)
const view = ref<'dashboard' | 'skills' | 'team' | 'settings'>('dashboard')
const prevView = ref<'dashboard' | 'skills' | 'team'>('dashboard')

function openSettings(): void {
  if (view.value !== 'settings') prevView.value = view.value
  view.value = 'settings'
}

function filterPlatform(id: string | null): void {
  platformFilter.value = platformFilter.value === id && id !== null ? null : id
  view.value = 'skills'
}

function filterProject(v: string | null): void {
  projectFilter.value = projectFilter.value === v && v !== null ? null : v
  view.value = 'skills'
}

watch(platforms, (v) => setPlatformNames(v))
watch(skills, (v) => {
  // keep the open sheet in sync after install/uninstall refreshes
  if (selected.value) {
    selected.value = v.find((s) => s.name === selected.value!.name) ?? null
  }
})

function onSidebarShortcut(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onSidebarShortcut)
  await syncCustomPlatforms()
  await refresh()
})

onUnmounted(() => window.removeEventListener('keydown', onSidebarShortcut))
</script>

<template>
  <SettingsPage v-if="view === 'settings'" @back="view = prevView" />
  <div v-else class="flex h-screen flex-col">
    <!-- title bar: drag strip with the sidebar toggle next to the traffic lights -->
    <div class="app-drag flex h-10 shrink-0 items-center">
      <button
        class="app-no-drag ml-[78px] rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        :title="`${t('app.toggleSidebar')} (⌘B)`"
        :aria-label="t('app.toggleSidebar')"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <PanelLeft class="size-4" />
      </button>
    </div>

    <div class="flex min-h-0 flex-1">
    <!-- sidebar -->
    <aside
      :class="[
        'sidebar-surface flex shrink-0 flex-col overflow-hidden bg-muted/30 transition-[width] duration-200',
        sidebarCollapsed ? 'w-0' : 'w-56 border-r',
      ]"
    >
      <div class="flex h-full w-56 shrink-0 flex-col">
      <div class="flex items-center gap-2 px-4 py-3">
        <Blocks class="size-5 text-primary" />
        <span class="font-semibold tracking-tight">SkillBuddy</span>
      </div>

      <nav class="flex flex-col gap-0.5 px-2">
        <button
          :class="[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            view === 'dashboard' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="view = 'dashboard'"
        >
          <LayoutDashboard class="size-4 text-foreground/70" />
          {{ t('dashboard.title') }}
        </button>
        <button
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            view === 'skills' && platformFilter === null && projectFilter === null
              ? 'nav-active'
              : 'hover:bg-accent/60',
          ]"
          @click="((platformFilter = null), (projectFilter = null), (view = 'skills'))"
        >
          <span class="flex items-center gap-2">
            <Blocks class="size-4 text-foreground/70" />
            {{ t('dashboard.skillsNav') }}
          </span>
          <span class="text-xs tabular-nums text-muted-foreground">{{ skills.length }}</span>
        </button>
        <button
          :class="[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            view === 'team' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="view = 'team'"
        >
          <Users class="size-4 text-foreground/70" />
          {{ t('team.title') }}
        </button>
        <p class="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('app.platforms') }}
        </p>
        <button
          v-for="p in detectedPlatforms"
          :key="p.id"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            view === 'skills' && platformFilter === p.id
              ? 'nav-active'
              : 'hover:bg-accent/60',
          ]"
          @click="filterPlatform(p.id)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <PlatformIcon :id="p.id" :size="15" class="text-foreground/70" />
            <span class="truncate">{{ p.displayName }}</span>
          </span>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ countByPlatform.get(p.id) ?? 0 }}
          </span>
        </button>

        <template v-if="projectRoots.length > 0">
          <p
            class="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ t('app.scope') }}
          </p>
          <button
            :class="[
              'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              view === 'skills' && projectFilter === 'user'
                ? 'nav-active'
                : 'hover:bg-accent/60',
            ]"
            @click="filterProject('user')"
          >
            {{ t('app.userGlobal') }}
          </button>
          <button
            v-for="root in projectRoots"
            :key="root"
            :class="[
              'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              view === 'skills' && projectFilter === root
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
      </nav>

      <div class="mt-auto px-2 pb-3">
        <button
          class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          @click="openSettings"
        >
          <Settings class="size-4" />
          {{ t('common.settings') }}
        </button>
      </div>
      </div>
    </aside>

    <!-- main -->
    <main v-if="selected" class="content-surface flex min-w-0 flex-1 flex-col">
      <SkillDetailPage :key="selected.name" :skill="selected" @close="selected = null" />
    </main>
    <main v-else class="content-surface flex min-w-0 flex-1 flex-col">
      <header
        v-if="view === 'dashboard'"
        class="app-drag flex items-center gap-3 px-6 py-3"
      >
        <div class="flex-1" />
        <Button
          variant="outline"
          size="sm"
          class="app-no-drag"
          :disabled="loading"
          @click="refresh"
        >
          <RefreshCw :class="loading ? 'animate-spin' : ''" />
          {{ t('app.rescan') }}
        </Button>
      </header>
      <header
        v-else-if="view === 'team'"
        class="app-drag flex items-center gap-3 px-6 py-3"
      >
        <h1 class="text-sm font-semibold tracking-tight">{{ t('team.title') }}</h1>
      </header>
      <header
        v-else
        class="app-drag flex items-center gap-3 px-6 py-3"
      >
        <div class="app-no-drag relative w-72">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input v-model="search" :placeholder="t('app.searchPlaceholder')" class="pl-8" />
        </div>
        <button
          type="button"
          :class="[
            'app-no-drag flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            driftOnly
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground hover:border-primary/40',
          ]"
          @click="driftOnly = !driftOnly"
        >
          <TriangleAlert class="size-3.5" />
          {{ t('app.driftOnly') }}
        </button>
        <Select v-model="sortBy" class="app-no-drag" :options="sortOptions" />
        <div class="flex-1" />
        <Button variant="outline" size="sm" class="app-no-drag" @click="newOpen = true">
          <Plus />
        </Button>
        <Button variant="outline" size="sm" class="app-no-drag" @click="importOpen = true">
          <Import />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="app-no-drag"
          :disabled="loading"
          @click="refresh"
        >
          <RefreshCw :class="loading ? 'animate-spin' : ''" />
          {{ t('app.rescan') }}
        </Button>
      </header>

      <div v-if="view === 'dashboard'" class="flex-1 overflow-y-auto">
        <DashboardPage
          @open-skill="selected = $event"
          @new-skill="newOpen = true"
          @import="importOpen = true"
        />
      </div>

      <div v-else-if="view === 'team'" class="flex-1 overflow-y-auto">
        <TeamPage @open-settings="openSettings" />
      </div>

      <div v-else class="flex-1 overflow-y-auto px-6 py-5">
        <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
          {{ t('app.scanning') }}
        </div>

        <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>

        <div
          v-else-if="skills.length === 0"
          class="flex flex-col items-center gap-3 py-24 text-muted-foreground"
        >
          <FolderOpen class="size-10" />
          <p class="text-sm">{{ t('app.empty') }}</p>
          <p class="max-w-sm text-center text-xs">
            {{ t('app.emptyHint', { n: detectedPlatforms.length }) }}
          </p>
        </div>

        <div
          v-else-if="filtered.length === 0"
          class="py-24 text-center text-sm text-muted-foreground"
        >
          {{ t('app.noMatch', { q: search }) }}
        </div>

        <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          <SkillCard
            v-for="skill in filtered"
            :key="skill.name"
            :skill="skill"
            @open="selected = skill"
          />
        </div>
      </div>
    </main>

    <NewSkillSheet :open="newOpen" @close="newOpen = false" />
    <ImportSheet :open="importOpen" @close="importOpen = false" />
    </div>
  </div>
</template>

<style>
.app-drag {
  -webkit-app-region: drag;
}
.app-no-drag {
  -webkit-app-region: no-drag;
}
</style>
