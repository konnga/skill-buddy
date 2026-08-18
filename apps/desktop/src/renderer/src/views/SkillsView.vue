<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpen, X } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import GroupEmptyState from '@/components/groups/GroupEmptyState.vue'
import GroupApplyPanel from '@/components/skills/GroupApplyPanel.vue'
import GroupMemberEditorDialog from '@/components/skills/GroupMemberEditorDialog.vue'
import GroupRenameDialog from '@/components/skills/GroupRenameDialog.vue'
import SkillActionDialogs from '@/components/skills/SkillActionDialogs.vue'
import SkillBatchActionBar from '@/components/skills/SkillBatchActionBar.vue'
import SkillsToolbar, {
  type OwnershipFilterModel,
  type SkillSortBy,
  type SkillViewMode,
} from '@/components/skills/SkillsToolbar.vue'
import SkillAgentTree from '@/components/SkillAgentTree.vue'
import SkillCard from '@/components/SkillCard.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkillBatchActions } from '@/composables/useSkillBatchActions'
import { useSkillGroupContext } from '@/composables/useSkillGroupContext'
import { useSkillItemActions } from '@/composables/useSkillItemActions'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{
  openSkill: [skill: AggregatedSkill]
  editSkill: [skill: AggregatedSkill]
  newSkill: []
  importSkills: []
  navigate: [view: 'groups']
}>()

const { t } = useI18n()
const {
  detectedPlatforms,
  loading,
  error,
  search,
  driftOnly,
  platformFilter,
  projectFilter,
  ownershipFilter,
  sortBy,
  filtered,
  skills,
  refresh,
} = useSkills()
const { projectRoots } = useSettings()
const {
  batchMode,
  selectedNames,
  batchBusy,
  batchProjectOpen,
  batchProjectRoot,
  batchProjectAgents,
  batchGroupOpen,
  batchGroupNames,
  pendingBatch,
  selectedSkills,
  allVisibleSelected,
  selectedTargetCount,
  projectCapablePlatforms,
  projectOptions,
  setBatchMode,
  toggleSelected,
  toggleSelectAll,
  clearSelection,
  openBatchProject,
  toggleBatchProjectAgent,
  addSelectedToProject,
  openBatchGroups,
  toggleBatchGroup,
  addSelectedToGroups,
  requestBatch,
  confirmBatch,
  updateBatchDialog,
  resetBatchContext,
} = useSkillBatchActions()

/** 视图模式只影响页面展示，读取失败时安全回退到网格视图。 */
let storedViewMode: unknown
try {
  storedViewMode = JSON.parse(localStorage.getItem('skm.skillsViewMode') ?? 'null')
} catch {
  storedViewMode = null
}
const viewMode = shallowRef<SkillViewMode>(storedViewMode === 'tree' ? 'tree' : 'grid')
const {
  groupFilter,
  groups,
  groupApplyOpen,
  groupApplyTargets,
  groupApplyBusy,
  groupApplyNote,
  activeTemp,
  activeGroupState,
  groupCount,
  filterGroup,
  applyGroup,
  applyGroupTemp,
  endTemp,
  activeGroupEmpty,
  renameOpen,
  renameValue,
  memberEditorOpen,
  memberSearch,
  draftMemberNames,
  renameDuplicate,
  groupStatusVariant,
  cannotManageGroup,
  memberEditorSkills,
  memberEditorMissingNames,
  backToGroups,
  openRenameGroup,
  submitRenameGroup,
  removeActiveGroup,
  exportActiveGroup,
  setActiveGroupEnabled,
  openMemberEditor,
  toggleDraftMember,
  saveGroupMembers,
  removeSkillFromActiveGroup,
} = useSkillGroupContext({
  resetBatchContext,
  navigateToGroups: () => emit('navigate', 'groups'),
})

const {
  removing,
  toggling,
  pendingUninstall,
  pendingToggle,
  busySkillNames,
  requestUninstall,
  updateUninstallDialog,
  confirmUninstall,
  requestToggle,
  updateToggleDialog,
  confirmToggle,
} = useSkillItemActions()

const sortOptions = computed<{ value: SkillSortBy; label: string }[]>(() => [
  { value: 'name', label: t('sort.name') },
  { value: 'recent', label: t('sort.recent') },
])

const ownershipModel = computed<OwnershipFilterModel>({
  get: () => ownershipFilter.value ?? 'all',
  set: (value: string) => {
    ownershipFilter.value = value === 'managed' || value === 'agent' ? value : null
  },
})

const ownershipOptions = computed<{ value: OwnershipFilterModel; label: string }[]>(() => [
  { value: 'all', label: t('app.allSources') },
  { value: 'managed', label: t('app.managedByMe') },
  { value: 'agent', label: t('app.managedByAgent') },
])

const hasActiveFilters = computed(
  () =>
    Boolean(search.value.trim()) ||
    platformFilter.value !== null ||
    projectFilter.value !== null ||
    ownershipFilter.value !== null ||
    driftOnly.value ||
    groupFilter.value !== null,
)

watch(viewMode, (value) => localStorage.setItem('skm.skillsViewMode', JSON.stringify(value)))

function clearFilters(): void {
  search.value = ''
  platformFilter.value = null
  projectFilter.value = null
  ownershipFilter.value = null
  driftOnly.value = false
  filterGroup(null)
}

</script>

<template>
  <div class="flex h-full flex-col">
    <SkillsToolbar
      :inset="props.inset"
      :group-filter="groupFilter"
      :active-group-state="activeGroupState"
      :active-group-empty="activeGroupEmpty"
      :group-status-variant="groupStatusVariant"
      :cannot-manage-group="cannotManageGroup"
      :group-apply-open="groupApplyOpen"
      :search="search"
      :sort-by="sortBy"
      :sort-options="sortOptions"
      :ownership-model="ownershipModel"
      :ownership-options="ownershipOptions"
      :drift-only="driftOnly"
      :view-mode="viewMode"
      :batch-mode="batchMode"
      :batch-busy="batchBusy"
      :filtered-count="filtered.length"
      :all-visible-selected="allVisibleSelected"
      :selected-count="selectedNames.size"
      :loading="loading"
      @update:groupApplyOpen="groupApplyOpen = $event"
      @update:search="search = $event"
      @update:sortBy="sortBy = $event"
      @update:ownershipModel="ownershipModel = $event"
      @update:driftOnly="driftOnly = $event"
      @update:viewMode="viewMode = $event"
      @update:batchMode="setBatchMode"
      @back-to-groups="backToGroups"
      @open-member-editor="openMemberEditor"
      @set-group-enabled="setActiveGroupEnabled"
      @export-group="exportActiveGroup"
      @open-rename-group="openRenameGroup"
      @remove-group="removeActiveGroup"
      @new-skill="emit('newSkill')"
      @import-skills="emit('importSkills')"
      @refresh="refresh"
      @toggle-select-all="toggleSelectAll"
      @clear-selection="clearSelection"
    />

    <ScrollArea class="flex-1" viewport-class="px-6 py-5">
      <GroupApplyPanel
        v-if="groupFilter"
        :open="groupApplyOpen"
        :targets="groupApplyTargets"
        :busy="groupApplyBusy"
        :note="groupApplyNote"
        :skill-count="groupCount(groupFilter)"
        :temporary-installed-count="activeTemp?.installed.length ?? null"
        @update:targets="groupApplyTargets = $event"
        @apply="applyGroup"
        @apply-temporary="applyGroupTemp"
        @end-temporary="endTemp(groupFilter)"
      />

      <SkillBatchActionBar
        :selected-count="selectedSkills.length"
        :target-count="selectedTargetCount"
        :busy="batchBusy"
        :has-projects="projectRoots.length > 0"
        :has-project-platforms="projectCapablePlatforms.length > 0"
        :has-groups="groups.length > 0"
        @open-project="openBatchProject"
        @open-groups="openBatchGroups"
        @request="requestBatch"
      />

      <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.scanning') }}
      </div>
      <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>
      <GroupEmptyState
        v-else-if="groupFilter && activeGroupState && activeGroupEmpty"
        :name="activeGroupState.name"
        @browse-skills="openMemberEditor"
        @new-skill="emit('newSkill')"
      />
      <div
        v-else-if="skills.length === 0"
        class="flex flex-col items-center gap-3 py-24 text-muted-foreground"
      >
        <FolderOpen class="size-10" />
        <p class="text-sm">{{ t('app.empty') }}</p>
        <p class="max-w-sm text-center text-sm">
          {{ t('app.emptyHint', { n: detectedPlatforms.length }) }}
        </p>
      </div>
      <div
        v-else-if="filtered.length === 0"
        class="flex flex-col items-center gap-3 py-24 text-center text-sm text-muted-foreground"
      >
        <p>
          {{
            search.trim()
              ? t('app.noMatch', { q: search.trim() })
              : t('app.noFilteredMatch')
          }}
        </p>
        <Button
          v-if="hasActiveFilters"
          variant="outline"
          size="sm"
          class="cursor-pointer gap-1.5"
          @click="clearFilters"
        >
          <X class="size-3.5" />
          {{ t('app.clearFilters') }}
        </Button>
      </div>
      <SkillAgentTree
        v-else-if="viewMode === 'tree'"
        :skills="filtered"
        :batch-mode="batchMode"
        :group-context="Boolean(groupFilter)"
        :selected-names="selectedNames"
        :busy-names="busySkillNames"
        :current-platform="platformFilter ?? undefined"
        :project-filter="projectFilter ?? undefined"
        :ownership-filter="ownershipFilter ?? undefined"
        @open="emit('openSkill', $event)"
        @edit="emit('editSkill', $event)"
        @toggle-selected="toggleSelected"
        @toggle-enabled="requestToggle"
        @remove-from-group="removeSkillFromActiveGroup"
        @uninstall="requestUninstall"
      />
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SkillCard
          v-for="skill in filtered"
          :key="skill.name"
          :skill="skill"
          :busy="removing.has(skill.name) || toggling.has(skill.name)"
          :batch-mode="batchMode"
          :group-context="Boolean(groupFilter)"
          :selected="selectedNames.has(skill.name)"
          :current-platform="platformFilter ?? undefined"
          :scope-filter="
            projectFilter ? (projectFilter === 'user' ? 'user' : 'project') : undefined
          "
          :project-root="
            projectFilter && projectFilter !== 'user' ? projectFilter : undefined
          "
          :ownership-filter="ownershipFilter ?? undefined"
          @open="emit('openSkill', skill)"
          @edit="emit('editSkill', skill)"
          @toggle-selected="toggleSelected(skill.name)"
          @toggle-enabled="requestToggle(skill)"
          @remove-from-group="removeSkillFromActiveGroup(skill.name)"
          @uninstall-current="requestUninstall(skill, platformFilter)"
          @uninstall-all="requestUninstall(skill, null)"
        />
      </div>
    </ScrollArea>

    <SkillActionDialogs
      :pending-uninstall="pendingUninstall"
      :pending-toggle="pendingToggle"
      :pending-batch="pendingBatch"
      :batch-project-open="batchProjectOpen"
      :batch-project-root="batchProjectRoot"
      :batch-project-agents="batchProjectAgents"
      :project-options="projectOptions"
      :project-capable-platforms="projectCapablePlatforms"
      :batch-group-open="batchGroupOpen"
      :batch-group-names="batchGroupNames"
      :groups="groups"
      :selected-count="selectedSkills.length"
      :batch-busy="batchBusy"
      :removing-names="removing"
      :toggling-names="toggling"
      @uninstall-dialog-change="updateUninstallDialog"
      @confirm-uninstall="confirmUninstall"
      @toggle-dialog-change="updateToggleDialog"
      @confirm-toggle="confirmToggle"
      @batch-dialog-change="updateBatchDialog"
      @confirm-batch="confirmBatch"
      @update:batchProjectOpen="batchProjectOpen = $event"
      @update:batchProjectRoot="batchProjectRoot = $event"
      @toggle-project-agent="toggleBatchProjectAgent"
      @add-selected-to-project="addSelectedToProject"
      @update:batchGroupOpen="batchGroupOpen = $event"
      @toggle-batch-group="toggleBatchGroup"
      @add-selected-to-groups="addSelectedToGroups"
    />

    <GroupRenameDialog
      :open="renameOpen"
      :value="renameValue"
      :duplicate="renameDuplicate"
      @update:open="renameOpen = $event"
      @update:value="renameValue = $event"
      @submit="submitRenameGroup"
    />

    <GroupMemberEditorDialog
      :open="memberEditorOpen"
      :group-name="groupFilter"
      :search="memberSearch"
      :skills="memberEditorSkills"
      :missing-names="memberEditorMissingNames"
      :draft-member-names="draftMemberNames"
      @update:open="memberEditorOpen = $event"
      @update:search="memberSearch = $event"
      @toggle-member="toggleDraftMember"
      @save="saveGroupMembers"
    />
  </div>
</template>
