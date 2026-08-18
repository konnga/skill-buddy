<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowLeft, CloudDownload, ExternalLink, LibraryBig } from '@lucide/vue'
import type { TeamLibraryMcpDraft } from '../../../../shared/ipc.js'
import McpMarketConfigurationPanel from '@/components/mcp/McpMarketConfigurationPanel.vue'
import McpMarketOverviewSection from '@/components/mcp/McpMarketOverviewSection.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useMcpMarketDetail } from '@/composables/useMcpMarketDetail'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = defineProps<{
  item: McpMarketItem
  inset?: boolean
  installOnly?: boolean
  teamLibraryMode?: boolean
  actionBusy?: boolean
  actionError?: string | null
  existingNames?: string[]
}>()
const emit = defineEmits<{
  close: []
  reviewed: []
  addToTeamLibrary: [draft: TeamLibraryMcpDraft]
}>()

const { t } = useI18n()
const {
  projectRoots,
  platforms,
  planning,
  loading,
  error,
  candidates,
  candidateError,
  detailMeta,
  overview,
  selectedCandidate,
  targets,
  localNames,
  visibleError,
  currentCandidate,
  alreadyInTeamLibrary,
  openPage,
  setSelectedCandidate,
  setTargets,
  reviewInstall,
  createTeamLibraryDraft,
} = useMcpMarketDetail({
  item: () => props.item,
  actionError: () => props.actionError,
  existingNames: () => props.existingNames,
})

async function handleReview(): Promise<void> {
  if (await reviewInstall()) emit('reviewed')
}

function handleAddToTeamLibrary(): void {
  const draft = createTeamLibraryDraft()
  if (draft) emit('addToTeamLibrary', draft)
}
</script>

<template>
  <div :class="['flex min-w-0 flex-col', props.installOnly ? 'min-h-0 flex-1' : 'h-full']">
    <header
      v-if="!props.installOnly"
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
        :title="t('common.back')"
        :aria-label="t('common.back')"
        @click="emit('close')"
      >
        <ArrowLeft />
      </Button>
      <h1 class="min-w-0 truncate text-base font-semibold">{{ props.item.name }}</h1>
      <div class="flex-1" />
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag cursor-pointer"
        @click="openPage(props.item.link)"
      >
        <ExternalLink />
        {{ t('mcp.market.openPage') }}
      </Button>
    </header>

    <ScrollArea
      class="flex-1"
      :viewport-class="props.installOnly ? 'px-5 py-4' : 'px-6 py-6'"
    >
      <div
        :class="[
          'mx-auto flex flex-col gap-5',
          props.installOnly ? 'max-w-none' : 'max-w-3xl',
        ]"
      >
        <div v-if="!props.installOnly" class="flex items-start gap-4">
          <img
            v-if="props.item.icon"
            :src="props.item.icon"
            alt=""
            class="size-16 shrink-0 rounded-xl border object-cover"
          />
          <div class="min-w-0">
            <h2 class="text-2xl font-semibold">{{ props.item.name }}</h2>
            <p v-if="props.item.author" class="mt-1 text-sm text-muted-foreground">
              {{ props.item.author }}
            </p>
            <p v-if="props.item.description" class="mt-3 text-sm leading-6 text-foreground/85">
              {{ props.item.description }}
            </p>
          </div>
        </div>

        <p
          v-if="visibleError"
          class="rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {{ visibleError }}
        </p>
        <div v-if="loading" class="flex flex-col gap-2">
          <Skeleton class="h-20 rounded-md" />
          <Skeleton class="h-12 rounded-md" />
        </div>
        <McpMarketConfigurationPanel
          v-if="!loading && !error"
          :detail-meta="detailMeta"
          :candidates="candidates"
          :candidate-error="candidateError"
          :selected-candidate="selectedCandidate"
          :targets="targets"
          :local-names="localNames"
          :existing-names="props.existingNames ?? []"
          :platforms="platforms"
          :project-roots="projectRoots"
          :planning="planning"
          :install-only="Boolean(props.installOnly)"
          :team-library-mode="Boolean(props.teamLibraryMode)"
          @update:selected-candidate="setSelectedCandidate"
          @update:targets="setTargets"
          @open-page="openPage"
          @review="handleReview"
        />

        <McpMarketOverviewSection
          v-if="!props.installOnly && !loading && !error"
          :overview="overview"
        />
      </div>
    </ScrollArea>

    <footer
      v-if="props.installOnly && !loading && candidates.length > 0"
      class="flex shrink-0 justify-end border-t px-5 py-4"
    >
      <Button
        size="sm"
        class="cursor-pointer"
        :disabled="
          props.teamLibraryMode
            ? props.actionBusy || alreadyInTeamLibrary || !currentCandidate
            : planning || targets.length === 0 || !currentCandidate
        "
        @click="props.teamLibraryMode ? handleAddToTeamLibrary() : handleReview()"
      >
        <LibraryBig v-if="props.teamLibraryMode" />
        <CloudDownload v-else />
        {{
          props.teamLibraryMode
            ? alreadyInTeamLibrary
              ? '已在团队库'
              : props.actionBusy
                ? '正在加入…'
                : '加入团队库'
            : t('mcp.form.review')
        }}
      </Button>
    </footer>
  </div>
</template>
