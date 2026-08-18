<script setup lang="ts">
import { computed } from 'vue'
import { Boxes, FilePlus2, FolderOpen, PackagePlus, ServerCog, Sparkles } from '@lucide/vue'
import type { TeamContributionWorkspace } from '../../../../shared/ipc.js'
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

const tabs = computed(() => [
  { id: 'skills' as const, label: 'Skills', icon: Sparkles },
  { id: 'mcp' as const, label: 'MCP Servers', icon: ServerCog },
  { id: 'bundles' as const, label: '岗位包', icon: PackagePlus },
  { id: 'policy' as const, label: '规范', icon: Boxes },
  { id: 'changes' as const, label: '变更', icon: FilePlus2 },
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
        所有变更仅在此草稿分支中，发布审核前不会影响团队成员。
      </span>
    </span>
    <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('open')">
      <FolderOpen />
      打开工作区
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
