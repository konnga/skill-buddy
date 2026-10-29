<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TeamBundleEditorDialog from '@/components/team/TeamBundleEditorDialog.vue'
import TeamChangeReview from '@/components/team/TeamChangeReview.vue'
import TeamLibraryBundlesTab from '@/components/team/TeamLibraryBundlesTab.vue'
import TeamLibraryMcpTab from '@/components/team/TeamLibraryMcpTab.vue'
import TeamLibraryInstructionsTab from '@/components/team/TeamLibraryInstructionsTab.vue'
import TeamLibraryPolicyTab from '@/components/team/TeamLibraryPolicyTab.vue'
import TeamLibrarySetupPanel from '@/components/team/TeamLibrarySetupPanel.vue'
import TeamPublishResult from '@/components/team/TeamPublishResult.vue'
import TeamLibrarySkillsTab from '@/components/team/TeamLibrarySkillsTab.vue'
import TeamLibraryWorkspaceHeader from '@/components/team/TeamLibraryWorkspaceHeader.vue'
import TeamLocalBundleDialog from '@/components/team/TeamLocalBundleDialog.vue'
import TeamLocalInstructionDialog from '@/components/team/TeamLocalInstructionDialog.vue'
import TeamLocalMcpDialog from '@/components/team/TeamLocalMcpDialog.vue'
import TeamLocalSkillDialog from '@/components/team/TeamLocalSkillDialog.vue'
import TeamMcpEditorDialog from '@/components/team/TeamMcpEditorDialog.vue'
import TeamInstructionEditorDialog from '@/components/team/TeamInstructionEditorDialog.vue'
import TeamMcpMarketDialog from '@/components/team/TeamMcpMarketDialog.vue'
import TeamSkillEditorDialog from '@/components/team/TeamSkillEditorDialog.vue'
import TeamSkillMarketDialog from '@/components/team/TeamSkillMarketDialog.vue'
import { confirmDialog } from '@/composables/useConfirm'
import { useTeamLibraryWorkspaceEditor } from '@/composables/useTeamLibraryWorkspaceEditor'

const { t } = useI18n()

const {
  manager,
  activeTab,
  libraryKey,
  branchSlug,
  libraryOptions,
  canStart,
  catalog,
  policy,
  policyScope,
  policyOptions,
  newTeamId,
  newTeamName,
  skillDialogOpen,
  editingSkill,
  mcpDialogOpen,
  editingMcp,
  instructionDialogOpen,
  editingInstruction,
  bundleDialogOpen,
  editingBundle,
  bundleError,
  skillMarketOpen,
  skillMarketBusy,
  skillMarketError,
  localSkillOpen,
  localSkillBusy,
  localSkillError,
  localMcpOpen,
  localInstructionOpen,
  localInstructionBusy,
  existingSkillNames,
  mcpMarketOpen,
  mcpMarketBusy,
  mcpMarketError,
  existingMcpNames,
  start,
  editSkill,
  saveSkill,
  editMcp,
  saveMcp,
  openLocalMcp,
  addLocalMcp,
  createInstruction,
  editInstruction,
  saveInstruction,
  openLocalInstructions,
  addLocalInstruction,
  createBundle,
  editBundle,
  saveBundle,
  closeBundleDialog,
  localBundleOpen,
  localBundleBusy,
  openLocalBundles,
  createBundleFromLocal,
  openSkillMarket,
  openLocalSkills,
  addLocalSkill,
  addMarketSkill,
  openMcpMarket,
  addMarketMcp,
  remove,
  savePolicy,
} = useTeamLibraryWorkspaceEditor()

/** 放弃草稿会删除整个工作区目录，未推送的改动无法恢复，必须先确认。 */
async function discardDraft(): Promise<void> {
  const confirmed = await confirmDialog({
    title: t('team.discardDraftTitle'),
    message: t('team.discardDraftMessage'),
    confirmLabel: t('team.discardDraft'),
    cancelLabel: t('common.cancel'),
    danger: true,
  })
  if (confirmed) await manager.discard()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TeamPublishResult
      v-if="!manager.workspace.value"
      :result="manager.publishResult.value"
    />
    <TeamLibrarySetupPanel
      v-if="manager.restoring.value || !manager.workspace.value"
      :restoring="manager.restoring.value"
      :library-key="libraryKey"
      :library-options="libraryOptions"
      :branch-slug="branchSlug"
      :busy="manager.busy.value"
      :can-start="canStart"
      @update:library-key="libraryKey = $event"
      @update:branch-slug="branchSlug = $event"
      @start="start"
    />

    <template v-else>
      <TeamLibraryWorkspaceHeader
        :workspace="manager.workspace.value"
        :error="manager.error.value"
        :active-tab="activeTab"
        @update:active-tab="activeTab = $event"
        @open="manager.openWorkspace"
      />

      <TeamLibrarySkillsTab
        v-if="activeTab === 'skills'"
        :skills="catalog?.skills ?? []"
        @market="openSkillMarket"
        @local="openLocalSkills"
        @edit="editSkill"
        @remove="remove($event, t('team.assetSkill'))"
      />
      <TeamLibraryMcpTab
        v-else-if="activeTab === 'mcp'"
        :mcp-servers="catalog?.mcpServers ?? []"
        @market="openMcpMarket"
        @local="openLocalMcp"
        @edit="editMcp"
        @remove="remove($event, t('team.assetMcp'))"
      />
      <TeamLibraryInstructionsTab
        v-else-if="activeTab === 'instructions'"
        :instructions="catalog?.instructions ?? []"
        @create="createInstruction"
        @local="openLocalInstructions"
        @edit="editInstruction"
        @remove="remove($event, t('team.assetInstruction'))"
      />
      <TeamLibraryBundlesTab
        v-else-if="activeTab === 'bundles'"
        :bundles="catalog?.bundles ?? []"
        @create="createBundle"
        @local="openLocalBundles"
        @edit="editBundle"
        @remove="remove($event, t('team.assetBundle'))"
      />
      <TeamLibraryPolicyTab
        v-else-if="activeTab === 'policy'"
        v-model:policy="policy"
        v-model:policy-scope="policyScope"
        v-model:new-team-id="newTeamId"
        v-model:new-team-name="newTeamName"
        :policy-options="policyOptions"
        :busy="manager.busy.value"
        @save="savePolicy"
      />
      <TeamChangeReview
        v-else
        :diff="manager.diff.value"
        :result="manager.publishResult.value"
        :busy="manager.busy.value"
        @open="manager.openWorkspace"
        @discard="discardDraft"
        @publish="manager.publish"
      />
    </template>

    <TeamSkillEditorDialog
      :open="skillDialogOpen"
      :initial="editingSkill"
      :busy="manager.busy.value"
      @close="skillDialogOpen = false"
      @save="saveSkill"
    />
    <TeamMcpEditorDialog
      :open="mcpDialogOpen"
      :initial="editingMcp"
      :busy="manager.busy.value"
      @close="mcpDialogOpen = false"
      @save="saveMcp"
    />
    <TeamInstructionEditorDialog
      :open="instructionDialogOpen"
      :initial="editingInstruction"
      :busy="manager.busy.value"
      @close="instructionDialogOpen = false"
      @save="saveInstruction"
    />
    <TeamBundleEditorDialog
      :open="bundleDialogOpen"
      :initial="editingBundle"
      :skills="catalog?.skills ?? []"
      :mcp-servers="catalog?.mcpServers ?? []"
      :busy="manager.busy.value"
      :error="bundleError"
      @close="closeBundleDialog"
      @save="saveBundle"
    />
    <TeamLocalBundleDialog
      :open="localBundleOpen"
      :busy="localBundleBusy"
      :available-names="existingSkillNames"
      @close="!localBundleBusy && (localBundleOpen = false)"
      @select="createBundleFromLocal"
    />
    <TeamLocalMcpDialog
      :open="localMcpOpen"
      :busy="manager.busy.value"
      :existing-names="existingMcpNames"
      @close="localMcpOpen = false"
      @select="addLocalMcp"
    />
    <TeamLocalInstructionDialog
      :open="localInstructionOpen"
      :busy="localInstructionBusy"
      @close="!localInstructionBusy && (localInstructionOpen = false)"
      @select="addLocalInstruction"
    />
    <TeamSkillMarketDialog
      :open="skillMarketOpen"
      :busy="skillMarketBusy"
      :error="skillMarketError"
      @close="!skillMarketBusy && (skillMarketOpen = false)"
      @select="addMarketSkill"
    />
    <TeamLocalSkillDialog
      :open="localSkillOpen"
      :busy="localSkillBusy"
      :error="localSkillError"
      :existing-names="existingSkillNames"
      @close="!localSkillBusy && (localSkillOpen = false)"
      @select="addLocalSkill"
    />
    <TeamMcpMarketDialog
      :open="mcpMarketOpen"
      :busy="mcpMarketBusy"
      :error="mcpMarketError"
      :existing-names="existingMcpNames"
      @close="!mcpMarketBusy && (mcpMarketOpen = false)"
      @select="addMarketMcp"
    />
  </div>
</template>
