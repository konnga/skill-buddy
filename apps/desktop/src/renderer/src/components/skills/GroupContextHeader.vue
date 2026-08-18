<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  CloudDownload,
  Copy,
  Ellipsis,
  LayoutGrid,
  ListPlus,
  ListTree,
  Pencil,
  Power,
  PowerOff,
  Search,
  Trash2,
  X,
} from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import type { GroupRuntimeState } from '@/lib/group-runtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type SkillViewMode = 'grid' | 'tree'
type SkillSortBy = 'name' | 'recent'

/** 技能包上下文头部集中展示运行状态与包级操作，不直接修改技能包数据源。 */
const props = defineProps<{
  groupFilter: string
  activeGroupState: GroupRuntimeState
  activeGroupEmpty: boolean
  groupStatusVariant: 'success' | 'default' | 'secondary'
  cannotManageGroup: boolean
  groupApplyOpen: boolean
  search: string
  sortBy: SkillSortBy
  sortOptions: { value: SkillSortBy; label: string }[]
  viewMode: SkillViewMode
}>()

const emit = defineEmits<{
  'update:groupApplyOpen': [value: boolean]
  'update:search': [value: string]
  'update:sortBy': [value: SkillSortBy]
  'update:viewMode': [value: SkillViewMode]
  backToGroups: []
  openMemberEditor: []
  setGroupEnabled: [enabled: boolean]
  exportGroup: []
  openRenameGroup: []
  removeGroup: []
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
const viewModel = computed({
  get: () => props.viewMode,
  set: (value: SkillViewMode) => emit('update:viewMode', value),
})
</script>

<template>
  <div class="app-no-drag flex min-w-0 flex-1 items-center gap-2">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="-ml-2 size-8 shrink-0 cursor-pointer"
      :title="t('groups.backToList')"
      :aria-label="t('groups.backToList')"
      @click="emit('backToGroups')"
    >
      <ArrowLeft />
    </Button>
    <div class="min-w-0">
      <div class="flex min-w-0 items-center gap-2">
        <h1 class="truncate text-base font-semibold" :title="props.groupFilter">
          {{ props.groupFilter }}
        </h1>
        <Badge :variant="props.groupStatusVariant" class="text-xs">
          {{ t(`groups.status.${props.activeGroupState.status}`) }}
        </Badge>
      </div>
      <p class="truncate text-xs text-muted-foreground">
        {{
          t('groups.runtimeProgress', {
            installed: props.activeGroupState.installedSkills,
            total: props.activeGroupState.totalSkills,
            enabled: props.activeGroupState.enabledInstallations,
            disabled: props.activeGroupState.disabledInstallations,
          })
        }}
      </p>
    </div>
  </div>
  <div class="app-no-drag ml-auto flex shrink-0 items-center gap-2">
    <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('openMemberEditor')">
      <ListPlus />
      {{ t('groups.manageSkills') }}
    </Button>
    <Button
      size="sm"
      class="cursor-pointer"
      :disabled="props.activeGroupEmpty"
      @click="emit('update:groupApplyOpen', !props.groupApplyOpen)"
    >
      <CloudDownload />
      {{ t('groups.applyPackage') }}
    </Button>
    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <Button
          variant="outline"
          size="icon"
          class="size-8 cursor-pointer"
          :aria-label="t('groups.actions')"
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          :side-offset="6"
          class="z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
        >
          <DropdownMenuItem
            :disabled="props.cannotManageGroup || props.activeGroupState.status === 'enabled'"
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
            @select="emit('setGroupEnabled', true)"
          >
            <Power class="size-4 shrink-0" />
            {{ t('groups.enableGroup') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            :disabled="props.cannotManageGroup || props.activeGroupState.status === 'disabled'"
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
            @select="emit('setGroupEnabled', false)"
          >
            <PowerOff class="size-4 shrink-0" />
            {{ t('groups.disableGroup') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="my-1 h-px bg-border" />
          <DropdownMenuItem
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent"
            @select="emit('exportGroup')"
          >
            <Copy class="size-4 shrink-0" />
            {{ t('groups.exportAction') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent"
            @select="emit('openRenameGroup')"
          >
            <Pencil class="size-4 shrink-0" />
            {{ t('groups.renameAction') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="my-1 h-px bg-border" />
          <DropdownMenuItem
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
            @select="emit('removeGroup')"
          >
            <Trash2 class="size-4 shrink-0" />
            {{ t('groups.deleteAction') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
  <div class="app-no-drag flex w-full basis-full items-center gap-2 border-t pt-2">
    <div class="relative w-64 max-w-full">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="searchModel" :placeholder="t('groups.searchSkillsPh')" class="h-8 pl-8 pr-8" />
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
    <Select v-model="sortModel" :options="props.sortOptions" />
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
  </div>
</template>
