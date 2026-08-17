<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Blocks,
  ChevronRight,
  FolderOpen,
  Layers,
  LayoutDashboard,
  PanelLeft,
  Plus,
  ServerCog,
  Settings,
  Users,
} from '@lucide/vue'
import skillbuddyMarkUrl from '@/assets/logo.svg'
import PlatformIcon from '@/components/PlatformIcon.vue'
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

const agentsExpanded = shallowRef(true)
const scopeExpanded = shallowRef(true)
const activeMcpServerCount = computed(
  () =>
    mcpServers.value.filter((server) =>
      server.installations.some((installation) => installation.enabled !== false),
    ).length,
)
const expandedProjectRoot = computed(() =>
  projectFilter.value && projectFilter.value !== 'user' ? projectFilter.value : null,
)
const groupsActive = computed(
  () => props.view === 'groups' || (props.view === 'skills' && groupFilter.value !== null),
)

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

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

/** Open the native directory picker and add a new project scope. */
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
      'sidebar-surface flex shrink-0 flex-col overflow-hidden transition-[width] duration-200',
      sidebarCollapsed ? 'w-0' : 'w-[276px]',
    ]"
  >
    <div class="flex h-full w-[276px] shrink-0 flex-col">
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
        <button
          type="button"
          :class="[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'dashboard' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="navigatePrimary('dashboard')"
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
          <span class="text-sm tabular-nums text-muted-foreground">{{ skills.length }}</span>
        </button>
        <button
          type="button"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            groupsActive ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="navigatePrimary('groups')"
        >
          <span class="flex items-center gap-2">
            <Layers class="size-4 text-foreground/70" />
            {{ t('groups.navTitle') }}
          </span>
          <span class="text-sm tabular-nums text-muted-foreground">{{ groups.length }}</span>
        </button>
        <button
          type="button"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'mcp' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="navigatePrimary('mcp')"
        >
          <span class="flex items-center gap-2">
            <ServerCog class="size-4 text-foreground/70" />
            {{ t('mcp.title') }}
          </span>
          <span
            aria-hidden="true"
            class="text-sm tabular-nums text-muted-foreground"
          >
            {{ activeMcpServerCount }}
          </span>
        </button>
        <button
          type="button"
          :class="[
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'team' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="navigatePrimary('team')"
        >
          <Users class="size-4 text-foreground/70" />
          {{ t('team.title') }}
        </button>

        <section class="mt-4">
          <button
            type="button"
            class="mb-1 flex w-full cursor-pointer items-center gap-1 rounded-md px-3 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            aria-controls="sidebar-agents"
            :aria-expanded="agentsExpanded"
            @click="agentsExpanded = !agentsExpanded"
          >
            <ChevronRight
              :class="[
                'size-3 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
                agentsExpanded ? 'rotate-90' : '',
              ]"
              aria-hidden="true"
            />
            {{ t('app.agents') }}
          </button>
          <div
            id="sidebar-agents"
            :class="[
              'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
              agentsExpanded
                ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
                : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
            ]"
            :inert="!agentsExpanded"
          >
            <div class="min-h-0 overflow-hidden">
              <button
                v-for="platform in detectedPlatforms"
                :key="platform.id"
                type="button"
                :class="[
                  'flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
                  props.view === 'skills' &&
                  projectFilter === null &&
                  groupFilter === null &&
                  platformFilter === platform.id
                    ? 'nav-active'
                    : 'hover:bg-accent/60',
                ]"
                @click="filterPlatform(platform.id)"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <PlatformIcon :id="platform.id" :size="15" class="text-foreground/70" />
                  <span class="truncate">{{ platform.displayName }}</span>
                </span>
                <span class="text-sm tabular-nums text-muted-foreground">
                  {{ countByPlatform.get(platform.id) ?? 0 }}
                </span>
              </button>
            </div>
          </div>
        </section>

        <section class="mt-4">
          <div
            class="group/scope mb-1 flex items-center justify-between rounded-lg px-2 transition-colors hover:bg-black/[0.055] focus-within:bg-black/[0.055] dark:hover:bg-white/[0.07] dark:focus-within:bg-white/[0.07]"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-controls="sidebar-scope"
              :aria-expanded="scopeExpanded"
              @click="scopeExpanded = !scopeExpanded"
            >
              <ChevronRight
                :class="[
                  'size-3 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
                  scopeExpanded ? 'rotate-90' : '',
                ]"
                aria-hidden="true"
              />
              <span class="truncate">{{ t('app.scope') }}</span>
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-[color,background-color,opacity] hover:bg-black/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/scope:opacity-100 group-focus-within/scope:opacity-100 dark:hover:bg-white/[0.08]"
              :title="t('app.addScope')"
              :aria-label="t('app.addScope')"
              @click="addProjectRoot"
            >
              <Plus class="size-3.5" />
            </button>
          </div>
          <div
            id="sidebar-scope"
            :class="[
              'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
              scopeExpanded
                ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
                : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
            ]"
            :inert="!scopeExpanded"
          >
            <div class="min-h-0 overflow-hidden">
              <template v-for="root in projectRoots" :key="root">
                <button
                  type="button"
                  :class="[
                    'flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
                    props.view === 'skills' && projectFilter === root && platformFilter === null
                      ? 'nav-active'
                      : 'hover:bg-accent/60',
                  ]"
                  :title="root"
                  :aria-expanded="expandedProjectRoot === root"
                  @click="filterProject(root)"
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <ChevronRight
                      :class="[
                        'size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                        expandedProjectRoot === root ? 'rotate-90' : '',
                      ]"
                      aria-hidden="true"
                    />
                    <FolderOpen class="size-3.5 shrink-0 text-foreground/60" />
                    <span class="truncate">{{ basename(root) }}</span>
                  </span>
                  <span class="text-sm tabular-nums text-muted-foreground">
                    {{ countByProject.get(root) ?? 0 }}
                  </span>
                </button>
                <div
                  :class="[
                    'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
                    expandedProjectRoot === root
                      ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
                      : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
                  ]"
                  :inert="expandedProjectRoot !== root"
                >
                  <div class="min-h-0 overflow-hidden">
                    <div class="pb-1">
                      <button
                        v-for="platform in projectPlatformCounts.get(root) ?? []"
                        :key="`${root}:${platform.id}`"
                        type="button"
                        :class="[
                          'flex w-full cursor-pointer items-center justify-between rounded-md py-1.5 pl-12 pr-3 text-sm transition-colors',
                          props.view === 'skills' &&
                          projectFilter === root &&
                          platformFilter === platform.id
                            ? 'nav-active'
                            : 'hover:bg-accent/60',
                        ]"
                        :title="`${basename(root)} / ${platform.displayName}`"
                        @click="filterProjectPlatform(root, platform.id)"
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <PlatformIcon
                            :id="platform.id"
                            :size="15"
                            class="text-foreground/70"
                          />
                          <span class="truncate">{{ platform.displayName }}</span>
                        </span>
                        <span class="tabular-nums text-muted-foreground">
                          {{ platform.count }}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </section>

        </nav>
      </ScrollArea>

      <div class="shrink-0 px-2 pb-3">
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
