<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, Folder } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'
import SkillTreeBranch from '@/components/skills/SkillTreeBranch.vue'
import { useSkillTreeExpansion } from '@/composables/useSkillTreeExpansion'
import { agentLabel } from '@/lib/agents'
import {
  buildSkillAgentTree,
  type SkillTreeLabels,
} from '@/lib/skill-agent-tree'
import { pathBasename } from '@/lib/paths'

const props = defineProps<{
  skills: AggregatedSkill[]
  batchMode?: boolean
  groupContext?: boolean
  selectedNames: Set<string>
  busyNames: Set<string>
  currentPlatform?: string
  projectFilter?: string
  ownershipFilter?: 'managed' | 'agent'
}>()
const emit = defineEmits<{
  open: [skill: AggregatedSkill]
  edit: [skill: AggregatedSkill]
  toggleSelected: [name: string]
  toggleEnabled: [skill: AggregatedSkill, agent: string, projectFilter: string]
  removeFromGroup: [name: string]
  uninstall: [skill: AggregatedSkill, agent: string, projectFilter: string]
}>()

const { t } = useI18n()
const labels = computed<SkillTreeLabels>(() => ({
  agent: agentLabel,
  project: (root) => t('skillTree.project', { root: pathBasename(root) }),
  global: t('skillTree.global'),
  plugin: t('skillTree.plugin'),
  system: t('skillTree.system'),
  admin: t('skillTree.admin'),
  legacy: t('skillTree.legacy'),
}))
const tree = computed(() =>
  buildSkillAgentTree({
    skills: props.skills,
    platformId: props.currentPlatform,
    projectFilter: props.projectFilter,
    ownershipFilter: props.ownershipFilter,
    labels: labels.value,
  }),
)
const { expandedRoots, expandedBranches, toggleRoot, toggleBranch } =
  useSkillTreeExpansion(tree)

function forwardToggleEnabled(
  skill: AggregatedSkill,
  agent: string,
  projectFilter: string,
): void {
  emit('toggleEnabled', skill, agent, projectFilter)
}

function forwardUninstall(
  skill: AggregatedSkill,
  agent: string,
  projectFilter: string,
): void {
  emit('uninstall', skill, agent, projectFilter)
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border bg-background">
    <section v-for="root in tree" :key="root.key" class="border-b last:border-b-0">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 bg-muted/35 px-3 py-3 text-left text-base transition-colors hover:bg-muted/60"
        :title="root.title"
        @click="toggleRoot(root.key)"
      >
        <ChevronRight
          :class="[
            'size-4 shrink-0 text-muted-foreground transition-transform',
            expandedRoots.has(root.key) && 'rotate-90',
          ]"
        />
        <PlatformIcon v-if="root.kind === 'agent'" :id="root.platformId ?? ''" :size="18" />
        <Folder v-else class="size-[18px] shrink-0 text-muted-foreground" />
        <span class="min-w-0 truncate font-semibold">{{ root.label }}</span>
        <span class="ml-auto text-sm tabular-nums text-muted-foreground">
          {{ t('skillTree.skillCount', { n: root.skillCount }) }}
        </span>
      </button>

      <div v-if="expandedRoots.has(root.key)">
        <SkillTreeBranch
          v-for="branch in root.branches"
          :key="branch.key"
          :root-key="root.key"
          :branch="branch"
          :expanded="expandedBranches.has(`${root.key}:${branch.key}`)"
          :batch-mode="props.batchMode"
          :group-context="props.groupContext"
          :selected-names="props.selectedNames"
          :busy-names="props.busyNames"
          @toggle="toggleBranch"
          @open="emit('open', $event)"
          @edit="emit('edit', $event)"
          @toggle-selected="emit('toggleSelected', $event)"
          @toggle-enabled="forwardToggleEnabled"
          @remove-from-group="emit('removeFromGroup', $event)"
          @uninstall="forwardUninstall"
        />
      </div>
    </section>
  </div>
</template>
