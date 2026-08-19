<script setup lang="ts">
import { defineAsyncComponent, shallowRef, watch } from 'vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { useSkills } from '@/composables/useSkills'
import type { SkillBundle } from '@/lib/bundles'
import type { MarketItem } from '@/lib/market'
import type {
  SettingsCategory,
  SkillFocus,
  WorkspaceView as WorkspaceViewName,
} from '@/lib/navigation'

const AttentionPage = defineAsyncComponent(() => import('@/components/AttentionPage.vue'))
const BundleDetailPage = defineAsyncComponent(() => import('@/components/BundleDetailPage.vue'))
const BundlesPage = defineAsyncComponent(() => import('@/components/BundlesPage.vue'))
const MarketDetailPage = defineAsyncComponent(() => import('@/components/MarketDetailPage.vue'))
const NewSkillPage = defineAsyncComponent(() => import('@/components/NewSkillPage.vue'))
const SkillDetailPage = defineAsyncComponent(() => import('@/components/SkillDetailPage.vue'))
const DashboardView = defineAsyncComponent(() => import('@/views/DashboardView.vue'))
const GroupsView = defineAsyncComponent(() => import('@/views/GroupsView.vue'))
const SkillsView = defineAsyncComponent(() => import('@/views/SkillsView.vue'))
const McpServersView = defineAsyncComponent(() => import('@/views/McpServersView.vue'))
const TeamView = defineAsyncComponent(() => import('@/views/TeamView.vue'))

const props = defineProps<{
  view: WorkspaceViewName
  navigationRevision: number
  attentionRevision: number
  inset?: boolean
}>()
const emit = defineEmits<{
  attentionOpened: []
  openSettings: [category: SettingsCategory]
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

function openTeamFromAttention(): void {
  attentionOpen.value = false
  emit('navigate', 'team')
}

watch([() => props.view, () => props.navigationRevision], closeDetails)
watch(
  () => props.attentionRevision,
  (revision) => {
    if (revision === 0) return
    attentionOpen.value = true
    emit('attentionOpened')
  },
  { immediate: true },
)
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
      @open-team="openTeamFromAttention"
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
      @open-settings="emit('openSettings', $event)"
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
