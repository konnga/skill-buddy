<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AlertTriangle, KeyRound } from '@lucide/vue'
import type { TeamLibraryBundleSummary } from '../../../../shared/ipc.js'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import TeamBundleMemberList from '@/components/team/TeamBundleMemberList.vue'
import TeamBundlePlanSummary from '@/components/team/TeamBundlePlanSummary.vue'
import { Button } from '@/components/ui/button'
import { useTeamBundleInstall } from '@/composables/useTeamBundleInstall'

const props = defineProps<{ bundle: TeamLibraryBundleSummary }>()
const { t } = useI18n()
const {
  projectRoots,
  platforms,
  skillTargets,
  mcpTargets,
  preparing,
  installing,
  prepared,
  error,
  success,
  skillMembers,
  mcpMembers,
  blockedReasons,
  blockedEntries,
  requiredSecrets,
  selectionReady,
  planCurrent,
  planCanApply,
  planWarnings,
  planBlockers,
  prepare,
  installPrepared,
} = useTeamBundleInstall(() => props.bundle)
</script>

<template>
  <div class="flex flex-col gap-4">
    <TeamBundleMemberList
      :skills="skillMembers"
      :mcp-servers="mcpMembers"
      :missing-skills="props.bundle.missingSkills"
      :missing-mcp-servers="props.bundle.missingMcpServers"
      :blocked-reasons="blockedReasons"
    />

    <div v-if="requiredSecrets.length" class="flex flex-wrap items-center gap-2 text-sm">
      <KeyRound class="size-4 text-muted-foreground" />
      <span class="font-medium">{{ t('team.requiredSecrets') }}</span>
      <code
        v-for="secret in requiredSecrets"
        :key="secret"
        class="rounded bg-muted px-1.5 py-0.5 text-xs"
      >
        {{ secret }}
      </code>
    </div>

    <div v-if="blockedEntries.length" class="space-y-1">
      <p
        v-for="entry in blockedEntries"
        :key="entry[0]"
        class="flex gap-2 text-sm text-destructive"
      >
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <span><code>{{ entry[0] }}</code>：{{ entry[1] }}</span>
      </p>
    </div>

    <PlatformTargetPicker
      v-if="skillMembers.length"
      v-model="skillTargets"
      :label="t('team.bundleSkillTargets')"
    />

    <div v-if="mcpMembers.length" class="flex flex-col gap-2">
      <span class="text-sm font-medium">{{ t('team.bundleMcpTargets') }}</span>
      <McpTargetPicker v-model="mcpTargets" :platforms="platforms" :project-roots="projectRoots" />
    </div>

    <TeamBundlePlanSummary
      v-if="prepared && planCurrent"
      :prepared="prepared"
      :can-apply="planCanApply"
      :warnings="planWarnings"
      :blockers="planBlockers"
      :skill-count="skillMembers.length"
      :skill-target-count="skillTargets.length"
      :mcp-count="mcpMembers.length"
      :mcp-target-count="mcpTargets.length"
    />

    <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
    <p v-if="success" class="text-sm text-emerald-700 dark:text-emerald-400">{{ success }}</p>

    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="!selectionReady || preparing || installing"
        @click="prepare"
      >
        {{ preparing ? t('team.bundlePreparing') : t('team.bundlePrepare') }}
      </Button>
      <Button
        size="sm"
        class="cursor-pointer"
        :disabled="!planCanApply || installing"
        @click="installPrepared"
      >
        {{ installing ? t('team.bundleInstalling') : t('team.bundleInstall') }}
      </Button>
    </div>
  </div>
</template>
