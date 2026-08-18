<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Blocks, Layers, LayoutDashboard, ServerCog, Users } from '@lucide/vue'
import type { WorkspaceView } from '@/lib/navigation'

const props = defineProps<{
  view: WorkspaceView
  skillCount: number
  groupCount: number
  activeMcpServerCount: number
  allSkillsActive: boolean
  groupsActive: boolean
}>()
const emit = defineEmits<{
  navigate: [view: WorkspaceView]
  showAllSkills: []
}>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    :class="[
      'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
      props.view === 'dashboard' ? 'nav-active' : 'hover:bg-accent/60',
    ]"
    @click="emit('navigate', 'dashboard')"
  >
    <LayoutDashboard class="size-4 text-foreground/70" />
    {{ t('dashboard.title') }}
  </button>
  <button
    type="button"
    :class="[
      'flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
      props.allSkillsActive ? 'nav-active' : 'hover:bg-accent/60',
    ]"
    @click="emit('showAllSkills')"
  >
    <span class="flex items-center gap-2">
      <Blocks class="size-4 text-foreground/70" />
      {{ t('dashboard.skillsNav') }}
    </span>
    <span class="text-sm tabular-nums text-muted-foreground">{{ props.skillCount }}</span>
  </button>
  <button
    type="button"
    :class="[
      'flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
      props.groupsActive ? 'nav-active' : 'hover:bg-accent/60',
    ]"
    @click="emit('navigate', 'groups')"
  >
    <span class="flex items-center gap-2">
      <Layers class="size-4 text-foreground/70" />
      {{ t('groups.navTitle') }}
    </span>
    <span class="text-sm tabular-nums text-muted-foreground">{{ props.groupCount }}</span>
  </button>
  <button
    type="button"
    :class="[
      'flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
      props.view === 'mcp' ? 'nav-active' : 'hover:bg-accent/60',
    ]"
    @click="emit('navigate', 'mcp')"
  >
    <span class="flex items-center gap-2">
      <ServerCog class="size-4 text-foreground/70" />
      {{ t('mcp.title') }}
    </span>
    <span aria-hidden="true" class="text-sm tabular-nums text-muted-foreground">
      {{ props.activeMcpServerCount }}
    </span>
  </button>
  <button
    type="button"
    :class="[
      'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
      props.view === 'team' ? 'nav-active' : 'hover:bg-accent/60',
    ]"
    @click="emit('navigate', 'team')"
  >
    <Users class="size-4 text-foreground/70" />
    {{ t('team.title') }}
  </button>
</template>
