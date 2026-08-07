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
import SkillsView from '@/views/SkillsView.vue'
import TeamView from '@/views/TeamView.vue'

const props = defineProps<{ view: WorkspaceViewName; inset?: boolean }>()
const emit = defineEmits<{
  openSettings: []
  importSkills: []
}>()

const { skills } = useSkills()
const selected = shallowRef<AggregatedSkill | null>(null)
const selectedFocus = shallowRef<SkillFocus | null>(null)
const marketSelected = shallowRef<MarketItem | null>(null)
const attentionOpen = shallowRef(false)
const bundlesOpen = shallowRef(false)
const bundleSelected = shallowRef<SkillBundle | null>(null)
const newOpen = shallowRef(false)

function closeDetails(): void {
  selected.value = null
  selectedFocus.value = null
  marketSelected.value = null
  attentionOpen.value = false
  bundlesOpen.value = false
  bundleSelected.value = null
  newOpen.value = false
}

function openSkill(skill: AggregatedSkill, focus: SkillFocus | null = null): void {
  selected.value = skill
  selectedFocus.value = focus
}

function closeSkill(): void {
  selected.value = null
  selectedFocus.value = null
}

watch(() => props.view, closeDetails)
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
    <NewSkillPage v-else-if="newOpen" :inset="props.inset" @close="newOpen = false" />
    <DashboardView
      v-else-if="props.view === 'dashboard'"
      :inset="props.inset"
      @open-market="marketSelected = $event"
      @open-bundles="bundlesOpen = true"
      @open-bundle="bundleSelected = $event"
      @open-attention="attentionOpen = true"
      @new-skill="newOpen = true"
      @import-skills="emit('importSkills')"
    />
    <TeamView
      v-else-if="props.view === 'team'"
      :inset="props.inset"
      @open-settings="emit('openSettings')"
    />
    <SkillsView
      v-else
      :inset="props.inset"
      @open-skill="openSkill"
      @new-skill="newOpen = true"
      @import-skills="emit('importSkills')"
    />
  </main>
</template>
