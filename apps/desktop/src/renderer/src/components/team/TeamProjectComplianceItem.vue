<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CircleCheck, FileWarning, FolderGit2, PackageCheck, ServerCog, Settings2, Sparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  TeamProjectCompliance,
  TeamProjectRequirementStatus,
} from '@/composables/useTeamProjects'
import { pathBasename } from '@/lib/paths'

const props = defineProps<{ project: TeamProjectCompliance }>()
const emit = defineEmits<{ configure: [project: TeamProjectCompliance] }>()
const { t } = useI18n()

const issues = computed(() => props.project.requirements.filter((item) => item.state !== 'satisfied'))
const compliant = computed(() =>
  props.project.found && !props.project.error && issues.value.length === 0,
)

function typeIcon(type: TeamProjectRequirementStatus['type']) {
  if (type === 'bundle') return PackageCheck
  if (type === 'skill') return Sparkles
  return ServerCog
}

function stateLabel(item: TeamProjectRequirementStatus): string {
  return t(`team.projectState.${item.state}`)
}

function reasonLabel(item: TeamProjectRequirementStatus): string | null {
  if (!item.reason) return null
  const label = t(`team.projectReason.${item.reason}`, { n: item.detail ?? 0 })
  return item.policyReason ? `${label}：${item.policyReason}` : label
}
</script>

<template>
  <article class="rounded-md border px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-3">
        <FolderGit2 class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium" :title="project.projectRoot">
            {{ pathBasename(project.projectRoot) }}
          </span>
          <span class="block truncate font-mono text-xs text-muted-foreground" :title="project.configPath">
            {{ project.configPath }}
          </span>
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Badge v-if="compliant" variant="success">
          <CircleCheck class="mr-1 size-3.5" />{{ t('team.projectCompliant') }}
        </Badge>
        <Badge v-else-if="!project.found && !project.error" variant="outline">
          {{ t('team.projectNotConfigured') }}
        </Badge>
        <Badge v-else variant="outline" class="border-amber-500/50 text-amber-700 dark:text-amber-400">
          {{ t('team.projectAttention', { n: issues.length }) }}
        </Badge>
        <Button v-if="!project.error" variant="outline" size="sm" class="cursor-pointer" @click="emit('configure', project)">
          <Settings2 class="size-3.5" />{{ project.found ? t('team.projectEditConfig') : t('team.projectConfigure') }}
        </Button>
      </div>
    </div>

    <p v-if="project.error" class="mt-3 flex gap-2 text-sm text-destructive">
      <FileWarning class="mt-0.5 size-4 shrink-0" />
      <span>{{ project.error }}</span>
    </p>

    <div v-else-if="project.found" class="mt-3">
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{{ t('team.projectSatisfied', { n: project.satisfied }) }}</span>
        <span>{{ t('team.projectMissing', { n: project.missing }) }}</span>
        <span>{{ t('team.projectOutdated', { n: project.outdated }) }}</span>
        <span>{{ t('team.projectUnresolved', { n: project.unresolved }) }}</span>
        <span>{{ t('team.projectBlocked', { n: project.blocked }) }}</span>
      </div>
      <ul v-if="issues.length" class="mt-3 divide-y rounded-md border">
        <li v-for="item in issues" :key="`${item.type}:${item.ref}`" class="flex items-start gap-2 px-3 py-2 text-sm">
          <component :is="typeIcon(item.type)" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ item.label }}</span>
            <span class="block truncate font-mono text-xs text-muted-foreground" :title="item.ref">{{ item.ref }}</span>
            <span v-if="reasonLabel(item)" class="block text-xs text-muted-foreground">{{ reasonLabel(item) }}</span>
          </span>
          <Badge
            variant="outline"
            :class="item.state === 'unresolved' || item.state === 'blocked' ? 'border-destructive/50 text-destructive' : 'border-amber-500/50 text-amber-700 dark:text-amber-400'"
          >
            <AlertTriangle class="mr-1 size-3.5" />{{ stateLabel(item) }}
          </Badge>
        </li>
      </ul>
    </div>
  </article>
</template>
