<script setup lang="ts">
import SkillBatchConfirmDialog from '@/components/skills/dialogs/SkillBatchConfirmDialog.vue'
import SkillBatchGroupDialog from '@/components/skills/dialogs/SkillBatchGroupDialog.vue'
import SkillBatchProjectDialog from '@/components/skills/dialogs/SkillBatchProjectDialog.vue'
import SkillToggleDialog from '@/components/skills/dialogs/SkillToggleDialog.vue'
import SkillUninstallDialog from '@/components/skills/dialogs/SkillUninstallDialog.vue'
import type {
  BatchRequest,
  ToggleRequest,
  UninstallRequest,
} from '@/lib/skill-action-types'

/** 聚合层保留页面原有公开契约，各对话框只负责展示请求快照并上抛用户操作。 */
const props = defineProps<{
  pendingUninstall: UninstallRequest | null
  pendingToggle: ToggleRequest | null
  pendingBatch: BatchRequest | null
  batchProjectOpen: boolean
  batchProjectRoot: string
  batchProjectAgents: string[]
  projectOptions: { value: string; label: string }[]
  projectCapablePlatforms: { id: string; displayName: string }[]
  batchGroupOpen: boolean
  batchGroupNames: Set<string>
  groups: { name: string }[]
  selectedCount: number
  batchBusy: boolean
  removingNames: Set<string>
  togglingNames: Set<string>
}>()

const emit = defineEmits<{
  uninstallDialogChange: [open: boolean]
  confirmUninstall: []
  toggleDialogChange: [open: boolean]
  confirmToggle: []
  batchDialogChange: [open: boolean]
  confirmBatch: []
  'update:batchProjectOpen': [open: boolean]
  'update:batchProjectRoot': [root: string]
  toggleProjectAgent: [id: string]
  addSelectedToProject: []
  'update:batchGroupOpen': [open: boolean]
  toggleBatchGroup: [name: string]
  addSelectedToGroups: []
}>()
</script>

<template>
  <SkillUninstallDialog
    :request="props.pendingUninstall"
    :removing-names="props.removingNames"
    @open-change="emit('uninstallDialogChange', $event)"
    @confirm="emit('confirmUninstall')"
  />

  <SkillToggleDialog
    :request="props.pendingToggle"
    :toggling-names="props.togglingNames"
    @open-change="emit('toggleDialogChange', $event)"
    @confirm="emit('confirmToggle')"
  />

  <SkillBatchConfirmDialog
    :request="props.pendingBatch"
    :busy="props.batchBusy"
    @open-change="emit('batchDialogChange', $event)"
    @confirm="emit('confirmBatch')"
  />

  <SkillBatchProjectDialog
    :open="props.batchProjectOpen"
    :project-root="props.batchProjectRoot"
    :project-agents="props.batchProjectAgents"
    :project-options="props.projectOptions"
    :platforms="props.projectCapablePlatforms"
    :selected-count="props.selectedCount"
    :busy="props.batchBusy"
    @update:open="emit('update:batchProjectOpen', $event)"
    @update:project-root="emit('update:batchProjectRoot', $event)"
    @toggle-agent="emit('toggleProjectAgent', $event)"
    @confirm="emit('addSelectedToProject')"
  />

  <SkillBatchGroupDialog
    :open="props.batchGroupOpen"
    :selected-names="props.batchGroupNames"
    :groups="props.groups"
    :selected-count="props.selectedCount"
    @update:open="emit('update:batchGroupOpen', $event)"
    @toggle-group="emit('toggleBatchGroup', $event)"
    @confirm="emit('addSelectedToGroups')"
  />
</template>
