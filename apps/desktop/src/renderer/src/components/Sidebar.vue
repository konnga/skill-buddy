<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PanelLeft, Settings } from '@lucide/vue'
import skillbuddyMarkUrl from '@/assets/logo.svg'
import SidebarAgentsSection from '@/components/sidebar/SidebarAgentsSection.vue'
import SidebarPrimaryNav from '@/components/sidebar/SidebarPrimaryNav.vue'
import SidebarScopesSection from '@/components/sidebar/SidebarScopesSection.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGroups } from '@/composables/useGroups'
import { useMcpServers } from '@/composables/useMcpServers'
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
const collapsing = shallowRef(false)
let collapseTimer: ReturnType<typeof setTimeout> | undefined

watch(sidebarCollapsed, (collapsed, previous) => {
  if (!collapsed || previous !== false) {
    collapsing.value = false
    return
  }

  collapsing.value = true
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    collapsing.value = false
    collapseTimer = undefined
  }, 200)
})

onBeforeUnmount(() => {
  if (collapseTimer) clearTimeout(collapseTimer)
})
const {
  detectedPlatforms,
  countByPlatform,
  countByProject,
  projectPlatformCounts,
  platformFilter,
  projectFilter,
  groupFilter,
  ownershipFilter,
  refresh,
  skills,
} = useSkills()
const { groups, filterGroup } = useGroups()
const { servers: mcpServers } = useMcpServers()

const activeMcpServerCount = computed(
  () =>
    mcpServers.value.filter((server) =>
      server.installations.some((installation) => installation.enabled !== false),
    ).length,
)
const allSkillsActive = computed(
  () =>
    props.view === 'skills' &&
    platformFilter.value === null &&
    projectFilter.value === null &&
    groupFilter.value === null,
)
const groupsActive = computed(
  () => props.view === 'groups' || (props.view === 'skills' && groupFilter.value !== null),
)
const activeAgentFilter = computed(() =>
  props.view === 'skills' && projectFilter.value === null && groupFilter.value === null
    ? platformFilter.value
    : null,
)

function showAllSkills(): void {
  platformFilter.value = null
  projectFilter.value = null
  filterGroup(null)
  ownershipFilter.value = null
  emit('navigate', 'skills')
}

/** 离开技能包上下文并进入指定的一级页面。 */
function navigatePrimary(view: WorkspaceView): void {
  filterGroup(null)
  emit('navigate', view)
}

function filterPlatform(id: string): void {
  platformFilter.value = platformFilter.value === id ? null : id
  projectFilter.value = null
  filterGroup(null)
  emit('navigate', 'skills')
}

function filterProject(root: string): void {
  const isActive = projectFilter.value === root && platformFilter.value === null
  projectFilter.value = isActive ? null : root
  platformFilter.value = null
  filterGroup(null)
  emit('navigate', 'skills')
}

function filterProjectPlatform(root: string, id: string): void {
  const isActive = projectFilter.value === root && platformFilter.value === id
  projectFilter.value = root
  platformFilter.value = isActive ? null : id
  filterGroup(null)
  emit('navigate', 'skills')
}

/** 打开系统目录选择器并添加新的项目作用域。 */
async function addProjectRoot(): Promise<void> {
  const dir = await window.skillsManager.pickDirectory()
  if (!dir || projectRoots.value.includes(dir)) return
  projectRoots.value = [...projectRoots.value, dir]
  await refresh()
}
</script>

<template>
  <aside
    :class="[
      'sidebar-surface relative flex shrink-0 flex-col overflow-hidden transition-[width] duration-200',
      sidebarCollapsed ? 'w-0' : 'w-[276px]',
    ]"
  >
    <div class="relative flex h-full w-[276px] shrink-0 flex-col">
      <div
        class="pointer-events-none absolute inset-0 z-20 bg-background/45 opacity-0 transition-opacity duration-200"
        :class="collapsing && 'pointer-events-auto opacity-100'"
        aria-hidden="true"
      />
      <div class="app-drag flex h-10 shrink-0 items-center">
        <button
          type="button"
          class="app-no-drag ml-[78px] cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          :title="`${t('app.toggleSidebar')} (⌘B)`"
          :aria-label="t('app.toggleSidebar')"
          @click="sidebarCollapsed = true"
        >
          <PanelLeft class="size-4" />
        </button>
      </div>
      <div class="flex shrink-0 items-center gap-2 px-4 py-3">
        <img
          :src="skillbuddyMarkUrl"
          alt=""
          class="size-8 shrink-0 rounded-[10px]"
          aria-hidden="true"
        />
        <span class="font-semibold tracking-tight">SkillBuddy</span>
      </div>

      <ScrollArea
        class="flex-1 border-y border-transparent has-[[data-state=visible]]:border-black/10"
        viewport-class="[mask-image:linear-gradient(to_bottom,transparent_0,black_14px,black_calc(100%_-_14px),transparent_100%)]"
      >
        <nav class="flex flex-col gap-0.5 px-2 py-2">
          <SidebarPrimaryNav
            :view="props.view"
            :skill-count="skills.length"
            :group-count="groups.length"
            :active-mcp-server-count="activeMcpServerCount"
            :all-skills-active="allSkillsActive"
            :groups-active="groupsActive"
            @navigate="navigatePrimary"
            @show-all-skills="showAllSkills"
          />
          <SidebarAgentsSection
            :platforms="detectedPlatforms"
            :counts="countByPlatform"
            :active-platform="activeAgentFilter"
            @select="filterPlatform"
          />
          <SidebarScopesSection
            :project-roots="projectRoots"
            :count-by-project="countByProject"
            :project-platform-counts="projectPlatformCounts"
            :project-filter="projectFilter"
            :platform-filter="platformFilter"
            :skills-view="props.view === 'skills'"
            @add="addProjectRoot"
            @select-project="filterProject"
            @select-platform="filterProjectPlatform"
          />
        </nav>
      </ScrollArea>

      <div class="shrink-0 px-2 pb-3">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          @click="emit('openSettings')"
        >
          <Settings class="size-4" />
          {{ t('common.settings') }}
        </button>
      </div>
    </div>
  </aside>
</template>
