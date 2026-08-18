<script setup lang="ts">
import { ChevronRight, Folder } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'
import SkillTreeLeafRow from '@/components/skills/SkillTreeLeafRow.vue'
import type { SkillTreeBranch } from '@/lib/skill-agent-tree'

const props = defineProps<{
  rootKey: string
  branch: SkillTreeBranch
  expanded: boolean
  batchMode?: boolean
  groupContext?: boolean
  selectedNames: Set<string>
  busyNames: Set<string>
}>()
const emit = defineEmits<{
  toggle: [key: string]
  open: [skill: AggregatedSkill]
  edit: [skill: AggregatedSkill]
  toggleSelected: [name: string]
  toggleEnabled: [skill: AggregatedSkill, agent: string, projectFilter: string]
  removeFromGroup: [name: string]
  uninstall: [skill: AggregatedSkill, agent: string, projectFilter: string]
}>()

const branchKey = `${props.rootKey}:${props.branch.key}`

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
  <section class="tree-branch">
    <button
      type="button"
      class="tree-branch-row flex w-full cursor-pointer items-center gap-2 py-2.5 pl-7 pr-8 text-left text-base transition-colors hover:bg-muted/40"
      :title="props.branch.title"
      @click="emit('toggle', branchKey)"
    >
      <ChevronRight
        :class="[
          'size-3.5 shrink-0 text-muted-foreground transition-transform',
          props.expanded && 'rotate-90',
        ]"
      />
      <PlatformIcon
        v-if="props.branch.kind === 'agent'"
        :id="props.branch.platformId ?? ''"
        :size="18"
      />
      <Folder v-else class="size-[18px] shrink-0 text-muted-foreground" />
      <span class="min-w-0 truncate font-medium">{{ props.branch.label }}</span>
      <span class="ml-auto text-sm tabular-nums text-muted-foreground">
        {{ props.branch.skills.length }}
      </span>
    </button>

    <div v-if="props.expanded" class="bg-muted/10">
      <SkillTreeLeafRow
        v-for="leaf in props.branch.skills"
        :key="leaf.skill.name"
        :leaf="leaf"
        :batch-mode="props.batchMode"
        :group-context="props.groupContext"
        :selected="props.selectedNames.has(leaf.skill.name)"
        :busy="props.busyNames.has(leaf.skill.name)"
        @open="emit('open', $event)"
        @edit="emit('edit', $event)"
        @toggle-selected="emit('toggleSelected', $event)"
        @toggle-enabled="forwardToggleEnabled"
        @remove-from-group="emit('removeFromGroup', $event)"
        @uninstall="forwardUninstall"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.tree-branch {
  position: relative;

  &::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1.25rem;
    width: 1px;
    background: var(--border);
    content: '';
  }

  &:last-child::before {
    bottom: auto;
    height: 1.25rem;
  }
}

.tree-branch-row {
  position: relative;

  &::before {
    position: absolute;
    top: 50%;
    left: 1.25rem;
    width: 0.5rem;
    height: 1px;
    background: var(--border);
    content: '';
  }
}
</style>
