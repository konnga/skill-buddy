<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Boxes, FolderGit2, GitBranch, PackageCheck, RefreshCw, ServerCog, Settings2, Sparkles, Users } from '@lucide/vue'
import GitTeamMcpCatalog from '@/components/team/GitTeamMcpCatalog.vue'
import GitTeamSkillCatalog from '@/components/team/GitTeamSkillCatalog.vue'
import GitTeamBundleCatalog from '@/components/team/GitTeamBundleCatalog.vue'
import TeamPolicyOverview from '@/components/team/TeamPolicyOverview.vue'
import TeamLibraryManagementPanel from '@/components/team/TeamLibraryManagementPanel.vue'
import TeamProjectInstallPanel from '@/components/team/TeamProjectInstallPanel.vue'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/composables/useSettings'
import { useTeamLibraries } from '@/composables/useTeamLibraries'

const emit = defineEmits<{ openSettings: [] }>()
const { teamLibraries } = useSettings()
const { catalogs, loading, warnings, errors, compliance, syncAll } = useTeamLibraries()
const { t } = useI18n()

const configured = computed(() => teamLibraries.value.length > 0)
const activeTab = shallowRef<'bundles' | 'skills' | 'mcp' | 'projects' | 'manage'>('bundles')
const noticeEntries = computed(() => [
  ...Object.entries(warnings.value).map(([id, message]) => ({ id, message, warning: true })),
  ...Object.entries(errors.value).map(([id, message]) => ({ id, message, warning: false })),
])
const refreshing = computed(() => loading.value)

async function refreshTeam(): Promise<void> {
  await syncAll()
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
    <div
      v-if="!configured"
      class="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-16 text-center"
    >
      <Users class="size-8 text-muted-foreground" />
      <p class="max-w-sm text-sm text-muted-foreground">{{ t('team.configureHint') }}</p>
      <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('openSettings')">
        {{ t('team.configureAction') }}
      </Button>
    </div>

    <template v-else>
      <div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <span class="flex min-w-0 items-center gap-2 text-sm">
          <GitBranch class="size-4 shrink-0 text-muted-foreground" />
          <span class="truncate">
            {{ t('team.gitSource') }} · {{ catalogs.length }}/{{ teamLibraries.length }}
          </span>
        </span>
        <Button variant="outline" size="sm" class="cursor-pointer" :disabled="refreshing" @click="refreshTeam">
          <RefreshCw :class="['size-3.5', refreshing && 'animate-spin']" />
          {{ refreshing ? t('team.syncing') : t('team.sync') }}
        </Button>
      </div>
      <p
        v-for="notice in noticeEntries"
        :key="`${notice.id}:${notice.warning}`"
        :class="['break-all text-sm', notice.warning ? 'text-amber-600 dark:text-amber-400' : 'text-destructive']"
      >
        {{ notice.warning ? t('team.cachedWarning', { msg: notice.message }) : t('team.error', { msg: notice.message }) }}
      </p>
      <TeamPolicyOverview
        v-if="catalogs.length > 0"
        :missing-required="compliance.missingRequired.length"
        :blocked-installed="compliance.blockedInstalled.length"
        :update-available="compliance.updateAvailable"
        :recommended-missing="compliance.recommendedMissing"
      />
      <div v-if="catalogs.length === 0" class="flex items-center gap-3 rounded-md border border-dashed px-4 py-4 text-sm text-muted-foreground">
        <Boxes class="size-5 shrink-0" />
        <span class="flex-1">团队库已配置但还没有可用资源。请进入“管理”从市场添加 Skill 或 MCP。</span>
        <Button variant="outline" size="sm" class="cursor-pointer" @click="activeTab = 'manage'">打开管理</Button>
      </div>
      <div class="flex w-fit max-w-full flex-wrap items-center rounded-md bg-muted p-1" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'bundles'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'bundles' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'bundles'"
        >
          <PackageCheck class="size-4" />
          {{ t('team.bundlesTab') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'skills'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'skills' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'skills'"
        >
          <Sparkles class="size-4" />
          {{ t('team.skillsTab') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'mcp'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'mcp' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'mcp'"
        >
          <ServerCog class="size-4" />
          {{ t('team.mcpTab') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'projects'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'projects' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'projects'"
        >
          <FolderGit2 class="size-4" />
          项目安装
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'manage'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'manage' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'manage'"
        >
          <Settings2 class="size-4" />
          管理
        </button>
      </div>

      <GitTeamBundleCatalog v-if="activeTab === 'bundles'" />
      <GitTeamSkillCatalog v-else-if="activeTab === 'skills'" />
      <GitTeamMcpCatalog v-else-if="activeTab === 'mcp'" />
      <TeamProjectInstallPanel v-else-if="activeTab === 'projects'" :catalogs="catalogs" />
      <TeamLibraryManagementPanel v-else-if="activeTab === 'manage'" />
    </template>
  </div>
</template>
