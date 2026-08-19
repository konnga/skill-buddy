<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Boxes, FilePlus2, FolderOpen, PackagePlus, ServerCog, Sparkles } from '@lucide/vue'
import type { TeamContributionWorkspace } from '#shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TeamLibraryTab } from '@/composables/useTeamLibraryWorkspaceEditor'

const props = defineProps<{
  workspace: TeamContributionWorkspace
  error: string | null
  activeTab: TeamLibraryTab
}>()
const emit = defineEmits<{
  'update:activeTab': [value: TeamLibraryTab]
  open: []
}>()
const { t } = useI18n()

const tabs = computed(() => [
  { id: 'skills' as const, label: t('team.skillsTab'), icon: Sparkles },
  { id: 'mcp' as const, label: t('team.mcpTab'), icon: ServerCog },
  { id: 'bundles' as const, label: t('team.bundlesTab'), icon: PackagePlus },
  { id: 'policy' as const, label: t('team.policyTab'), icon: Boxes },
  { id: 'changes' as const, label: t('team.changesTab'), icon: FilePlus2 },
])
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
    <span class="min-w-0">
      <span class="flex items-center gap-2 text-sm font-medium">
        <code>{{ props.workspace.branch }}</code>
        <Badge variant="secondary">{{ props.workspace.libraryId }}</Badge>
      </span>
      <span class="block truncate text-xs text-muted-foreground">
        {{ t('team.managementDraftHint') }}
      </span>
    </span>
    <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('open')">
      <FolderOpen />
      {{ t('team.contributionOpen') }}
    </Button>
  </div>
  <p v-if="props.error" class="break-all text-sm text-destructive">{{ props.error }}</p>
  <div class="flex w-fit max-w-full flex-wrap rounded-md bg-muted p-1" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :class="[
        'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm',
        props.activeTab === tab.id
          ? 'bg-background font-medium shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="emit('update:activeTab', tab.id)"
    >
      <component :is="tab.icon" class="size-4" />
      {{ tab.label }}
    </button>
  </div>
</template>
