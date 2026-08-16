<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import TeamProjectComplianceItem from '@/components/team/TeamProjectComplianceItem.vue'
import { Button } from '@/components/ui/button'
import type { TeamProjectCompliance } from '@/composables/useTeamProjects'

defineProps<{
  projects: TeamProjectCompliance[]
  loading: boolean
}>()
const emit = defineEmits<{ refresh: []; configure: [project: TeamProjectCompliance] }>()
const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold">{{ t('team.projectComplianceTitle') }}</h2>
      <Button
        variant="ghost"
        size="icon"
        class="size-8 cursor-pointer"
        :title="t('team.projectRefresh')"
        :aria-label="t('team.projectRefresh')"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <RefreshCw :class="['size-4', loading && 'animate-spin']" />
      </Button>
    </div>
    <TeamProjectComplianceItem
      v-for="project in projects"
      :key="project.projectRoot"
      :project="project"
      @configure="emit('configure', $event)"
    />
  </section>
</template>
