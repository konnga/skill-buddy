<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CheckCircle2 } from '@lucide/vue'
import type { PreparedBundlePlan } from '@/composables/useTeamBundleInstall'

const props = defineProps<{
  prepared: PreparedBundlePlan
  canApply: boolean
  warnings: string[]
  blockers: string[]
  skillCount: number
  skillTargetCount: number
  mcpCount: number
  mcpTargetCount: number
}>()

const { t } = useI18n()
</script>

<template>
  <div class="rounded-md border bg-muted/20 px-3 py-3 text-sm">
    <p class="flex items-center gap-2 font-medium">
      <CheckCircle2 v-if="props.canApply" class="size-4 text-emerald-600" />
      <AlertTriangle v-else class="size-4 text-destructive" />
      {{ props.canApply ? t('team.bundlePlanReady') : t('team.bundlePlanBlocked') }}
    </p>
    <p class="mt-1 text-xs text-muted-foreground">
      {{
        t('team.bundlePlanSummary', {
          skills: props.skillCount,
          skillTargets: props.skillTargetCount,
          mcp: props.mcpCount,
          mcpTargets: props.mcpTargetCount,
        })
      }}
    </p>
    <ul v-if="props.prepared.mcpPlans.length" class="mt-3 divide-y rounded-md border bg-background">
      <li v-for="item in props.prepared.mcpPlans" :key="item.source.path" class="px-3 py-2">
        <p class="text-sm font-medium">{{ item.source.name }}</p>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ t('team.bundlePlanMcpActions', { n: item.plan.actions.length }) }}
        </p>
        <p
          v-for="action in item.plan.actions"
          :key="action.sourceId"
          class="mt-1 truncate font-mono text-xs text-muted-foreground"
          :title="action.configPath"
        >
          {{ action.target.agent }} · {{ action.target.surface }} · {{ action.target.scope }} ·
          {{ action.configPath }}
        </p>
      </li>
    </ul>
    <p
      v-for="warning in props.warnings"
      :key="warning"
      class="mt-2 text-amber-700 dark:text-amber-400"
    >
      {{ warning }}
    </p>
    <p v-for="blocker in props.blockers" :key="blocker" class="mt-2 text-destructive">
      {{ blocker }}
    </p>
  </div>
</template>
