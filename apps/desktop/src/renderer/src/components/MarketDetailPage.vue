<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ExternalLink } from '@lucide/vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import MarketFilesTab from '@/components/market/MarketFilesTab.vue'
import MarketOverviewTab from '@/components/market/MarketOverviewTab.vue'
import MarketSkillGroupsPanel from '@/components/market/MarketSkillGroupsPanel.vue'
import MarketSkillHero from '@/components/market/MarketSkillHero.vue'
import MarketSkillInstallPanel from '@/components/market/MarketSkillInstallPanel.vue'
import MarketVersionsTab from '@/components/market/MarketVersionsTab.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMarketSkillDetail } from '@/composables/useMarketSkillDetail'
import type { MarketItem } from '@/lib/market'

type TabId = 'overview' | 'files' | 'versions'

const props = defineProps<{ item: MarketItem; inset?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const tab = shallowRef<TabId>('overview')

const tabs = computed(() => [
  { id: 'overview' as TabId, label: t('market.overview') },
  { id: 'files' as TabId, label: t('market.files') },
  ...(props.item.kind === 'skillhub'
    ? [{ id: 'versions' as TabId, label: t('market.versionHistory') }]
    : []),
])

const {
  targets,
  busy,
  error,
  selectedGroups,
  overviewLoading,
  matched,
  overviewContent,
  groupSkillName,
  groupSkillSource,
  groupOptions,
  setTargets,
  toggleGroup,
  addToSelectedGroups,
  install,
} = useMarketSkillDetail({
  item: () => props.item,
  onInstalled: () => emit('close'),
})

function openLink(): void {
  void window.skillsManager.openLink(props.item.link)
}

watch(
  () => props.item.key,
  () => {
    tab.value = 'overview'
  },
)
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag cursor-pointer"
        @click="emit('close')"
      >
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="select-text min-w-0 truncate text-base font-semibold leading-5 tracking-tight">
        {{ props.item.name }}
      </h1>
      <div class="flex-1" />
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag cursor-pointer"
        @click="openLink"
      >
        <ExternalLink class="size-3.5" />
        {{ t('market.viewSource') }}
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <MarketSkillHero :key="props.item.key" :item="props.item" @open-source="openLink" />

        <MarketSkillInstallPanel
          :targets="targets"
          :busy="busy"
          :error="error"
          @update:targets="setTargets"
          @install="install"
        />

        <MarketSkillGroupsPanel
          :groups="groupOptions"
          :selected="selectedGroups"
          :skill-name="groupSkillName"
          :skill-source="groupSkillSource"
          @toggle="toggleGroup"
          @add="addToSelectedGroups"
        />

        <div class="flex items-center gap-6 border-b">
          <button
            v-for="itemTab in tabs"
            :key="itemTab.id"
            type="button"
            :class="[
              '-mb-px cursor-pointer border-b-2 pb-2 text-sm transition-colors',
              tab === itemTab.id
                ? 'border-foreground font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]"
            @click="tab = itemTab.id"
          >
            {{ itemTab.label }}
          </button>
        </div>

        <MarketOverviewTab
          v-show="tab === 'overview'"
          :loading="overviewLoading"
          :content="overviewContent"
        />

        <MarketVersionsTab
          v-if="props.item.kind === 'skillhub'"
          v-show="tab === 'versions'"
          :active="tab === 'versions'"
          :item="props.item"
        />

        <MarketFilesTab
          v-show="tab === 'files'"
          :active="tab === 'files'"
          :matched="matched"
          :source-loading="overviewLoading"
        />
      </div>
    </ScrollArea>
  </div>
</template>
