<script setup lang="ts">
import TeamBundleEditorDialog from '@/components/team/TeamBundleEditorDialog.vue'
import TeamChangeReview from '@/components/team/TeamChangeReview.vue'
import TeamLibraryBundlesTab from '@/components/team/TeamLibraryBundlesTab.vue'
import TeamLibraryMcpTab from '@/components/team/TeamLibraryMcpTab.vue'
import TeamLibraryPolicyTab from '@/components/team/TeamLibraryPolicyTab.vue'
import TeamLibrarySetupPanel from '@/components/team/TeamLibrarySetupPanel.vue'
import TeamLibrarySkillsTab from '@/components/team/TeamLibrarySkillsTab.vue'
import TeamLibraryWorkspaceHeader from '@/components/team/TeamLibraryWorkspaceHeader.vue'
import TeamMcpEditorDialog from '@/components/team/TeamMcpEditorDialog.vue'
import TeamMcpMarketDialog from '@/components/team/TeamMcpMarketDialog.vue'
import TeamSkillEditorDialog from '@/components/team/TeamSkillEditorDialog.vue'
import TeamSkillMarketDialog from '@/components/team/TeamSkillMarketDialog.vue'
import { useTeamLibraryWorkspaceEditor } from '@/composables/useTeamLibraryWorkspaceEditor'

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
  bundleDialogOpen,
  editingBundle,
  bundleError,
  skillMarketOpen,
  skillMarketBusy,
  skillMarketError,
  mcpMarketOpen,
  mcpMarketBusy,
  mcpMarketError,
  existingMcpNames,
  start,
  editSkill,
  saveSkill,
  editMcp,
  saveMcp,
  createBundle,
  editBundle,
  saveBundle,
  closeBundleDialog,
  openSkillMarket,
  addMarketSkill,
  openMcpMarket,
  addMarketMcp,
  remove,
  savePolicy,
} = useTeamLibraryWorkspaceEditor()
</script>

<template>
  <div class="flex flex-col gap-4">
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
        @edit="editSkill"
        @remove="remove($event, 'Skill')"
      />
      <TeamLibraryMcpTab
        v-else-if="activeTab === 'mcp'"
        :mcp-servers="catalog?.mcpServers ?? []"
        @market="openMcpMarket"
        @edit="editMcp"
        @remove="remove($event, 'MCP Server')"
      />
      <TeamLibraryBundlesTab
        v-else-if="activeTab === 'bundles'"
        :bundles="catalog?.bundles ?? []"
        @create="createBundle"
        @edit="editBundle"
        @remove="remove($event, '岗位包')"
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
        @discard="manager.discard"
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
    <TeamSkillMarketDialog
      :open="skillMarketOpen"
      :busy="skillMarketBusy"
      :error="skillMarketError"
      @close="!skillMarketBusy && (skillMarketOpen = false)"
      @select="addMarketSkill"
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
