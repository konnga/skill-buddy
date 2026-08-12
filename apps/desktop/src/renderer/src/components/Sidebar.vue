<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import {
  Blocks,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  LayoutDashboard,
  PanelLeft,
  Plus,
  ServerCog,
  Settings,
  Trash2,
  Users,
} from '@lucide/vue'
import skillbuddyMarkUrl from '@/assets/skillbuddy-mark.svg'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGroups } from '@/composables/useGroups'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import type { WorkspaceView } from '@/lib/navigation'
import { mergePreset, parsePresetDocument, serializePreset } from '@/lib/preset-format'

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
const { groups, filterGroup, deleteGroup } = useGroups()

const groupCreateOpen = ref(false)
const newGroupName = ref('')
const groupImportOpen = shallowRef(false)
const groupImportContent = ref('')
const groupImportError = shallowRef<string | null>(null)
const bundlesExpanded = shallowRef(true)
const agentsExpanded = shallowRef(true)
const scopeExpanded = shallowRef(true)
const expandedProjectRoot = computed(() =>
  projectFilter.value && projectFilter.value !== 'user' ? projectFilter.value : null,
)

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

function showAllSkills(): void {
  platformFilter.value = null
  projectFilter.value = null
  groupFilter.value = null
  ownershipFilter.value = null
  emit('navigate', 'skills')
}

function filterPlatform(id: string): void {
  platformFilter.value = platformFilter.value === id ? null : id
  projectFilter.value = null
  emit('navigate', 'skills')
}

function filterProject(root: string): void {
  const isActive = projectFilter.value === root && platformFilter.value === null
  projectFilter.value = isActive ? null : root
  platformFilter.value = null
  emit('navigate', 'skills')
}

function filterProjectPlatform(root: string, id: string): void {
  const isActive = projectFilter.value === root && platformFilter.value === id
  projectFilter.value = root
  platformFilter.value = isActive ? null : id
  emit('navigate', 'skills')
}

function selectGroup(name: string): void {
  filterGroup(name)
  emit('navigate', 'skills')
}

/** Open the native directory picker and add a new project scope. */
async function addProjectRoot(): Promise<void> {
  const dir = await window.skillsManager.pickDirectory()
  if (!dir || projectRoots.value.includes(dir)) return
  projectRoots.value = [...projectRoots.value, dir]
  await refresh()
}

function startAddingGroup(): void {
  newGroupName.value = ''
  groupCreateOpen.value = true
}

function closeGroupCreate(): void {
  newGroupName.value = ''
  groupCreateOpen.value = false
}

/** Create an empty group directly from the sidebar. */
function createGroup(): void {
  const name = newGroupName.value.trim()
  if (!name || groups.value.some((group) => group.name === name)) return
  groups.value = [...groups.value, { name, skills: [] }]
  closeGroupCreate()
}

function openGroupImport(): void {
  groupImportContent.value = ''
  groupImportError.value = null
  groupImportOpen.value = true
}

function closeGroupImport(): void {
  groupImportOpen.value = false
  groupImportContent.value = ''
  groupImportError.value = null
}

function importGroup(): void {
  try {
    const imported = parsePresetDocument(groupImportContent.value)
    const outcome = mergePreset(groups.value, imported)
    if (outcome.result !== 'unchanged') groups.value = outcome.groups
    const messageKey = {
      created: 'groups.importCreated',
      merged: 'groups.importMerged',
      unchanged: 'groups.importUnchanged',
    }[outcome.result]
    showToast({
      message: t(messageKey, {
        name: imported.name,
        n: outcome.addedSkills,
      }),
    })
    closeGroupImport()
  } catch {
    groupImportError.value = t('groups.importInvalid')
  }
}

async function exportGroup(group: { name: string; skills: string[] }): Promise<void> {
  try {
    await navigator.clipboard.writeText(serializePreset(group))
    showToast({ message: t('groups.exported', { name: group.name }) })
  } catch {
    showToast({ message: t('groups.exportFailed') })
  }
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
          class="size-5 shrink-0"
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
          <span class="text-sm tabular-nums text-muted-foreground">{{ skills.length }}</span>
        </button>
        <button
          type="button"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            props.view === 'mcp' ? 'nav-active' : 'hover:bg-accent/60',
          ]"
          @click="emit('navigate', 'mcp')"
        >
          <span class="flex items-center gap-2">
            <ServerCog class="size-4 text-foreground/70" />
            {{ t('mcp.title') }}
          </span>
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

        <section class="mt-4">
          <div class="mb-1 flex items-center justify-between px-3">
            <button
              type="button"
              class="-ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded p-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              aria-controls="sidebar-bundles"
              :aria-expanded="bundlesExpanded"
              @click="bundlesExpanded = !bundlesExpanded"
            >
              <ChevronRight
                :class="[
                  'size-3 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
                  bundlesExpanded ? 'rotate-90' : '',
                ]"
                aria-hidden="true"
              />
              <span class="truncate">{{ t('groups.title') }}</span>
            </button>
            <span class="flex items-center gap-0.5">
              <button
                type="button"
                class="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                :title="t('groups.importAction')"
                :aria-label="t('groups.importAction')"
                @click="openGroupImport"
              >
                <Download class="size-3.5" />
              </button>
              <button
                type="button"
                class="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                :title="t('groups.createTitle')"
                :aria-label="t('groups.createTitle')"
                @click="startAddingGroup"
              >
                <Plus class="size-3.5" />
              </button>
            </span>
          </div>
          <div
            id="sidebar-bundles"
            :class="[
              'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
              bundlesExpanded
                ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
                : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
            ]"
            :inert="!bundlesExpanded"
          >
            <div class="min-h-0 overflow-hidden">
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
                  class="flex min-w-0 flex-1 cursor-pointer items-center text-left"
                  @click="selectGroup(group.name)"
                >
                  <span class="truncate">{{ group.name }}</span>
                </button>
                <span class="flex shrink-0 items-center gap-1">
                  <span class="text-sm tabular-nums text-muted-foreground">
                    {{ group.skills.length }}
                  </span>
                  <button
                    type="button"
                    class="hidden cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground group-hover/g:inline-flex"
                    :title="t('groups.exportAction')"
                    :aria-label="t('groups.exportAction')"
                    @click.stop="exportGroup(group)"
                  >
                    <Copy class="size-3" />
                  </button>
                  <button
                    type="button"
                    class="hidden cursor-pointer rounded p-0.5 text-muted-foreground hover:text-destructive group-hover/g:inline-flex"
                    :title="t('groups.deleteGroup')"
                    :aria-label="t('groups.deleteGroup')"
                    @click="deleteGroup(group.name)"
                  >
                    <Trash2 class="size-3" />
                  </button>
                </span>
              </div>
              <p v-if="groups.length === 0" class="px-3 py-1 text-sm text-muted-foreground">
                {{ t('groups.empty') }}
              </p>
            </div>
          </div>
        </section>

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
          <div class="mb-1 flex items-center justify-between px-3">
            <button
              type="button"
              class="-ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded p-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
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
              class="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
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

  <DialogRoot :open="groupCreateOpen" @update:open="(open) => !open && closeGroupCreate()">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="mb-4 text-base font-semibold tracking-tight">
          {{ t('groups.createTitle') }}
        </DialogTitle>
        <Input
          v-model="newGroupName"
          :placeholder="t('groups.createPh')"
          class="text-sm"
          autofocus
          @keydown.enter.prevent="createGroup"
        />
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="closeGroupCreate">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            :disabled="!newGroupName.trim() || groups.some((g) => g.name === newGroupName.trim())"
            @click="createGroup"
          >
            {{ t('common.add') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot :open="groupImportOpen" @update:open="(open) => !open && closeGroupImport()">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="text-base font-semibold tracking-tight">
          {{ t('groups.importTitle') }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t('groups.importDescription') }}
        </DialogDescription>
        <textarea
          v-model="groupImportContent"
          class="mt-4 min-h-52 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          :placeholder="t('groups.importPlaceholder')"
          spellcheck="false"
          @input="groupImportError = null"
        />
        <p v-if="groupImportError" class="mt-2 text-sm text-destructive">
          {{ groupImportError }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="closeGroupImport">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="!groupImportContent.trim()"
            @click="importGroup"
          >
            {{ t('groups.importAction') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
