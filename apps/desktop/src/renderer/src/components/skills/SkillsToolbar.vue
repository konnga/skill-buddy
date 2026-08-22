<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Check,
  Import,
  LayoutGrid,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from '@lucide/vue'
import type { GroupRuntimeState } from '@/lib/group-runtime'
import GroupContextHeader from '@/components/skills/GroupContextHeader.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export type SkillViewMode = 'grid' | 'tree'
export type SkillSortBy = 'name' | 'recent'
export type OwnershipFilterModel = 'all' | 'managed' | 'agent'

interface SortOption {
  value: SkillSortBy
  label: string
}

/** 工具栏只接收页面状态并上抛意图，不直接读写技能与技能包数据源。 */
const props = defineProps<{
  inset?: boolean
  groupFilter: string | null
  activeGroupState: GroupRuntimeState | null
  activeGroupEmpty: boolean
  groupStatusVariant: 'success' | 'default' | 'secondary'
  cannotManageGroup: boolean
  groupApplyOpen: boolean
  search: string
  sortBy: SkillSortBy
  sortOptions: SortOption[]
  ownershipModel: OwnershipFilterModel
  ownershipOptions: { value: OwnershipFilterModel; label: string }[]
  driftOnly: boolean
  viewMode: SkillViewMode
  batchMode: boolean
  batchBusy: boolean
  filteredCount: number
  allVisibleSelected: boolean
  selectedCount: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:groupApplyOpen': [value: boolean]
  'update:search': [value: string]
  'update:sortBy': [value: SkillSortBy]
  'update:ownershipModel': [value: OwnershipFilterModel]
  'update:driftOnly': [value: boolean]
  'update:viewMode': [value: SkillViewMode]
  'update:batchMode': [value: boolean]
  backToGroups: []
  openMemberEditor: []
  setGroupEnabled: [enabled: boolean]
  exportGroup: []
  openRenameGroup: []
  removeGroup: []
  newSkill: []
  importSkills: []
  refresh: []
  toggleSelectAll: []
  clearSelection: []
}>()

const { t } = useI18n()

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value),
})
const sortModel = computed({
  get: () => props.sortBy,
  set: (value: string) => {
    if (value === 'name' || value === 'recent') emit('update:sortBy', value)
  },
})
const ownershipModel = computed({
  get: () => props.ownershipModel,
  set: (value: string) => {
    if (value === 'all' || value === 'managed' || value === 'agent') {
      emit('update:ownershipModel', value)
    }
  },
})
const driftModel = computed({
  get: () => props.driftOnly,
  set: (value: boolean) => emit('update:driftOnly', value),
})
const viewModel = computed({
  get: () => props.viewMode,
  set: (value: SkillViewMode) => emit('update:viewMode', value),
})
const batchModel = computed({
  get: () => props.batchMode,
  set: (value: boolean) => emit('update:batchMode', value),
})
</script>

<template>
  <header
    :class="[
      'app-drag relative flex min-h-14 shrink-0 items-center gap-x-3 gap-y-2 border-b px-6 py-2',
      props.groupFilter && props.activeGroupState ? 'flex-wrap' : 'flex-nowrap',
      props.inset && 'pl-[118px]',
    ]"
  >
    <SidebarToggle />
    <GroupContextHeader
      v-if="props.groupFilter && props.activeGroupState"
      :group-filter="props.groupFilter"
      :active-group-state="props.activeGroupState"
      :active-group-empty="props.activeGroupEmpty"
      :group-status-variant="props.groupStatusVariant"
      :cannot-manage-group="props.cannotManageGroup"
      :group-apply-open="props.groupApplyOpen"
      :search="props.search"
      :sort-by="props.sortBy"
      :sort-options="props.sortOptions"
      :view-mode="props.viewMode"
      @update:groupApplyOpen="emit('update:groupApplyOpen', $event)"
      @update:search="emit('update:search', $event)"
      @update:sortBy="emit('update:sortBy', $event)"
      @update:viewMode="emit('update:viewMode', $event)"
      @back-to-groups="emit('backToGroups')"
      @open-member-editor="emit('openMemberEditor')"
      @set-group-enabled="emit('setGroupEnabled', $event)"
      @export-group="emit('exportGroup')"
      @open-rename-group="emit('openRenameGroup')"
      @remove-group="emit('removeGroup')"
    />
    <template v-else>
      <div class="app-no-drag flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div class="relative w-64 max-w-full grow sm:grow-0">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="searchModel" :placeholder="t('app.searchPlaceholder')" class="h-8 pl-8 pr-8" />
          <button
            v-if="props.search"
            type="button"
            class="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            :title="t('app.clearSearch')"
            :aria-label="t('app.clearSearch')"
            @click="searchModel = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <Select v-model="ownershipModel" :options="props.ownershipOptions" />
        <Select v-model="sortModel" :options="props.sortOptions" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          :aria-pressed="props.driftOnly"
          :class="[
            'cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5',
            props.driftOnly
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400'
              : 'text-foreground hover:border-foreground/40 hover:bg-background',
          ]"
          @click="driftModel = !driftModel"
        >
          <TriangleAlert class="size-3.5" />
          {{ t('app.driftOnly') }}
        </Button>
        <div class="flex shrink-0 items-center rounded-md border bg-background p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :class="['size-7 cursor-pointer', props.viewMode === 'grid' && 'bg-accent text-accent-foreground']"
            :title="t('app.gridView')"
            :aria-label="t('app.gridView')"
            :aria-pressed="props.viewMode === 'grid'"
            @click="viewModel = 'grid'"
          >
            <LayoutGrid class="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :class="['size-7 cursor-pointer', props.viewMode === 'tree' && 'bg-accent text-accent-foreground']"
            :title="t('app.treeView')"
            :aria-label="t('app.treeView')"
            :aria-pressed="props.viewMode === 'tree'"
            @click="viewModel = 'tree'"
          >
            <ListTree class="size-4" />
          </Button>
        </div>
        <label class="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
          <span>{{ t('batch.manage') }}</span>
          <Switch v-model="batchModel" :disabled="props.batchBusy" />
        </label>
        <Button
          v-if="props.batchMode && props.filteredCount > 0"
          variant="ghost"
          size="sm"
          class="cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5"
          :disabled="props.batchBusy"
          @click="emit('toggleSelectAll')"
        >
          <Check class="size-3.5" />
          {{ t(props.allVisibleSelected ? 'batch.clear' : 'batch.selectAll') }}
        </Button>
        <Button
          v-if="props.batchMode && props.selectedCount > 0"
          variant="ghost"
          size="sm"
          class="cursor-pointer px-2.5 font-normal"
          :disabled="props.batchBusy"
          @click="emit('clearSelection')"
        >
          {{ t('batch.clearSelection') }}
        </Button>
      </div>
      <div class="app-no-drag ml-auto flex shrink-0 self-start items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          class="cursor-pointer"
          :title="t('newSkill.title')"
          :aria-label="t('newSkill.title')"
          @click="emit('newSkill')"
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="cursor-pointer"
          :title="t('import.title')"
          :aria-label="t('import.title')"
          @click="emit('importSkills')"
        >
          <Import />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="cursor-pointer"
          :title="t('app.rescan')"
          :aria-label="t('app.rescan')"
          :loading="props.loading"
          @click="emit('refresh')"
        >
          <RefreshCw v-if="!props.loading" class="size-4" />
        </Button>
      </div>
    </template>
  </header>
</template>
