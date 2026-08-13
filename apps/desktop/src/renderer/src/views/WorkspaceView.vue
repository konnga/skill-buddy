<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import AttentionPage from '@/components/AttentionPage.vue'
import BundleDetailPage from '@/components/BundleDetailPage.vue'
import BundlesPage from '@/components/BundlesPage.vue'
import MarketDetailPage from '@/components/MarketDetailPage.vue'
import NewSkillPage from '@/components/NewSkillPage.vue'
import SkillDetailPage from '@/components/SkillDetailPage.vue'
import { useSkills } from '@/composables/useSkills'
import type { SkillBundle } from '@/lib/bundles'
import type { MarketItem } from '@/lib/market'
import type { SkillFocus, WorkspaceView as WorkspaceViewName } from '@/lib/navigation'
import DashboardView from '@/views/DashboardView.vue'
import GroupsView from '@/views/GroupsView.vue'
import SkillsView from '@/views/SkillsView.vue'
import McpServersView from '@/views/McpServersView.vue'
import TeamView from '@/views/TeamView.vue'

const props = defineProps<{
  view: WorkspaceViewName
  navigationRevision: number
  inset?: boolean
}>()
const emit = defineEmits<{
  openSettings: []
  importSkills: []
  navigate: [view: WorkspaceViewName]
}>()

const {
  skills,
  search,
  platformFilter,
  projectFilter,
  driftOnly,
  groupFilter,
  ownershipFilter,
} = useSkills()
const selected = shallowRef<AggregatedSkill | null>(null)
const selectedFocus = shallowRef<SkillFocus | null>(null)
const selectedMode = shallowRef<'view' | 'edit'>('view')
const marketSelected = shallowRef<MarketItem | null>(null)
const attentionOpen = shallowRef(false)
const bundlesOpen = shallowRef(false)
const bundleSelected = shallowRef<SkillBundle | null>(null)
const newOpen = shallowRef(false)
const conversationSkill = shallowRef<AggregatedSkill | null>(null)

function closeDetails(): void {
  selected.value = null
  selectedFocus.value = null
  selectedMode.value = 'view'
  marketSelected.value = null
  attentionOpen.value = false
  bundlesOpen.value = false
  bundleSelected.value = null
  newOpen.value = false
  conversationSkill.value = null
}

function openSkill(
  skill: AggregatedSkill,
  focus: SkillFocus | null = null,
  mode: 'view' | 'edit' = 'view',
): void {
  selected.value = skill
  selectedFocus.value = focus
  selectedMode.value = mode
}

function closeSkill(): void {
  selected.value = null
  selectedFocus.value = null
  selectedMode.value = 'view'
}

function openConversation(skill: AggregatedSkill | null = null): void {
  conversationSkill.value = skill
  newOpen.value = true
}

/** 打开与工作台全局漂移数量一致的 Skills 筛选结果。 */
function openDriftSkills(): void {
  search.value = ''
  platformFilter.value = null
  projectFilter.value = null
  groupFilter.value = null
  ownershipFilter.value = null
  driftOnly.value = true
  emit('navigate', 'skills')
}

function closeConversation(): void {
  newOpen.value = false
  conversationSkill.value = null
}

watch([() => props.view, () => props.navigationRevision], closeDetails)
watch(skills, (value) => {
  if (selected.value) {
    selected.value = value.find((skill) => skill.name === selected.value?.name) ?? null
  }
})
</script>

<template>
  <main class="content-surface flex min-w-0 flex-1 flex-col">
    <SkillDetailPage
      v-if="selected"
      :key="selected.name"
      :skill="selected"
      :focus="selectedFocus ?? undefined"
      :initial-mode="selectedMode"
      :inset="props.inset"
      @close="closeSkill"
    />
    <MarketDetailPage
      v-else-if="marketSelected"
      :key="marketSelected.key"
      :item="marketSelected"
      :inset="props.inset"
      @close="marketSelected = null"
    />
    <AttentionPage
      v-else-if="attentionOpen"
      :inset="props.inset"
      @close="attentionOpen = false"
      @open-skill="openSkill"
    />
    <BundleDetailPage
      v-else-if="bundleSelected"
      :key="bundleSelected.id"
      :bundle="bundleSelected"
      :inset="props.inset"
      @close="bundleSelected = null"
      @open-skill="marketSelected = $event"
    />
    <BundlesPage
      v-else-if="bundlesOpen"
      :inset="props.inset"
      @close="bundlesOpen = false"
      @open="bundleSelected = $event"
    />
    <NewSkillPage
      v-else-if="newOpen"
      :inset="props.inset"
      :skill="conversationSkill ?? undefined"
      @close="closeConversation"
    />
    <DashboardView
      v-else-if="props.view === 'dashboard'"
      :inset="props.inset"
      @open-market="marketSelected = $event"
      @open-bundles="bundlesOpen = true"
      @open-bundle="bundleSelected = $event"
      @open-attention="attentionOpen = true"
      @open-drift="openDriftSkills"
      @new-skill="openConversation()"
      @import-skills="emit('importSkills')"
    />
    <TeamView
      v-else-if="props.view === 'team'"
      :inset="props.inset"
      @open-settings="emit('openSettings')"
    />
    <McpServersView
      v-else-if="props.view === 'mcp'"
      :inset="props.inset"
    />
    <GroupsView
      v-else-if="props.view === 'groups'"
      :inset="props.inset"
      @navigate="emit('navigate', $event)"
    />
    <SkillsView
      v-else
      :inset="props.inset"
      @open-skill="openSkill"
      @edit-skill="openSkill($event, null, 'edit')"
      @new-skill="openConversation()"
      @import-skills="emit('importSkills')"
      @navigate="emit('navigate', $event)"
    />
  </main>
</template>
