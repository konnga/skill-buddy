<script setup lang="ts">
import { shallowRef, type DeepReadonly } from 'vue'
import type { TeamLibraryCatalog } from '../../../../shared/ipc.js'
import TeamProjectCompliance from '@/components/team/TeamProjectCompliance.vue'
import TeamProjectConfigDialog from '@/components/team/TeamProjectConfigDialog.vue'
import { useTeamProjects } from '@/composables/useTeamProjects'
import type { TeamProjectCompliance as TeamProjectComplianceState } from '@/composables/useTeamProjects'

defineProps<{
  catalogs: readonly DeepReadonly<TeamLibraryCatalog>[]
}>()

const {
  projects,
  loading,
  refresh,
} = useTeamProjects()
const projectConfigTarget = shallowRef<TeamProjectComplianceState | null>(null)
const projectConfigOpen = shallowRef(false)

function configureProject(project: TeamProjectComplianceState): void {
  projectConfigTarget.value = project
  projectConfigOpen.value = true
}

async function projectConfigured(): Promise<void> {
  projectConfigOpen.value = false
  await refresh()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TeamProjectCompliance
      v-if="projects.length > 0"
      :projects="projects"
      :loading="loading"
      @refresh="refresh"
      @configure="configureProject"
    />
    <div v-else class="rounded-md border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">
      暂无项目目录，请先在设置中添加需要安装团队资源的公司项目。
    </div>
  </div>
  <TeamProjectConfigDialog
    :open="projectConfigOpen"
    :project="projectConfigTarget"
    :catalogs="catalogs"
    @close="projectConfigOpen = false"
    @saved="projectConfigured"
  />
</template>
