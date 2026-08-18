<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Ellipsis, Pencil, Power, PowerOff, Trash2, TriangleAlert } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import type { SkillTreeLeaf } from '@/lib/skill-agent-tree'

const props = defineProps<{
  leaf: SkillTreeLeaf
  batchMode?: boolean
  groupContext?: boolean
  selected: boolean
  busy: boolean
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

function activate(): void {
  if (props.batchMode) emit('toggleSelected', props.leaf.skill.name)
  else emit('open', props.leaf.skill)
}
</script>

<template>
  <div
    :class="[
      'tree-skill-row group flex cursor-pointer items-center gap-3 py-3 pr-3 transition-colors hover:bg-muted/40',
      props.selected && 'bg-primary/5',
      props.leaf.allDisabled && 'opacity-60 saturate-75',
    ]"
    @click="activate"
  >
    <input
      v-if="props.batchMode"
      type="checkbox"
      :checked="props.selected"
      :aria-label="t('batch.selectSkill', { name: props.leaf.skill.name })"
      class="size-4 shrink-0 cursor-pointer accent-primary"
      @click.stop
      @change.stop="emit('toggleSelected', props.leaf.skill.name)"
    />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate text-base font-medium" :title="props.leaf.skill.name">
          {{ props.leaf.skill.name }}
        </span>
        <Badge v-if="props.leaf.readOnly" variant="secondary" class="shrink-0 text-xs">
          {{ t('card.readOnly') }}
        </Badge>
        <Badge
          v-if="props.leaf.allDisabled"
          variant="secondary"
          class="shrink-0 text-xs text-amber-600 dark:text-amber-400"
        >
          {{ t('card.disabled') }}
        </Badge>
        <Badge
          v-else-if="props.leaf.partiallyDisabled"
          variant="secondary"
          class="shrink-0 text-xs text-amber-600 dark:text-amber-400"
        >
          {{ t('card.partiallyDisabled') }}
        </Badge>
        <Badge
          v-if="props.leaf.skill.hasDrift"
          variant="outline"
          class="shrink-0 gap-1 border-amber-500/40 text-xs text-amber-600 dark:text-amber-400"
        >
          <TriangleAlert class="size-3" />
          {{ t('card.drift') }}
        </Badge>
      </div>
      <p class="mt-1 truncate text-sm leading-5 text-muted-foreground">
        {{ props.leaf.skill.description || t('card.noDescription') }}
      </p>
    </div>

    <span class="shrink-0 text-sm tabular-nums text-muted-foreground">
      {{ props.leaf.installations.length }}
    </span>
    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
          :aria-label="t('card.actions')"
          @click.stop
        >
          <Ellipsis class="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          :side-offset="6"
          class="z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          @click.stop
        >
          <DropdownMenuItem
            :disabled="props.leaf.readOnly || props.busy"
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
            @select="emit('edit', props.leaf.skill)"
          >
            <Pencil class="size-4" />
            {{ t('common.edit') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="!props.leaf.readOnly"
            :disabled="props.busy"
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
            @select="
              emit(
                'toggleEnabled',
                props.leaf.skill,
                props.leaf.agentId,
                props.leaf.projectFilter,
              )
            "
          >
            <PowerOff v-if="props.leaf.hasEnabled" class="size-4" />
            <Power v-else class="size-4" />
            {{ t(props.leaf.hasEnabled ? 'detail.disable' : 'detail.enable') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="my-1 h-px bg-border" />
          <DropdownMenuItem
            v-if="props.groupContext"
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
            @select="emit('removeFromGroup', props.leaf.skill.name)"
          >
            <Trash2 class="size-4" />
            {{ t('groups.removeSkill') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-else
            :disabled="props.leaf.readOnly || props.busy"
            class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
            @select="
              emit(
                'uninstall',
                props.leaf.skill,
                props.leaf.agentId,
                props.leaf.projectFilter,
              )
            "
          >
            <Trash2 class="size-4" />
            {{ t('skillTree.uninstall') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>

<style scoped lang="scss">
.tree-skill-row {
  position: relative;
  padding-left: 4.5rem;

  &::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3.5rem;
    width: 1px;
    background: var(--border);
    content: '';
  }

  &::after {
    position: absolute;
    top: 50%;
    left: 3.5rem;
    width: 1rem;
    height: 1px;
    background: var(--border);
    content: '';
  }

  &:last-child::before {
    bottom: 50%;
  }
}
</style>
