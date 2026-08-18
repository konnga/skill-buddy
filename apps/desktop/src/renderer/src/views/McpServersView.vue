<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, RefreshCw, Search, ServerCog, Store, TriangleAlert } from '@lucide/vue'
import type { McpInstallation, McpServerDefinition, McpTarget } from '@skillbuddy/core'
import McpPlanDialog from '@/components/mcp/McpPlanDialog.vue'
import McpServerDetail from '@/components/mcp/McpServerDetail.vue'
import McpServerForm from '@/components/mcp/McpServerForm.vue'
import McpServerList from '@/components/mcp/McpServerList.vue'
import McpSyncDialog from '@/components/mcp/McpSyncDialog.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { showToast } from '@/composables/useToast'
import McpMarketView from '@/views/McpMarketView.vue'

const props = defineProps<{ inset?: boolean }>()
const { t } = useI18n()
const { projectRoots } = useSettings()
const {
  servers,
  platforms,
  scanErrors,
  filteredServers,
  loading,
  planning,
  applying,
  error,
  search,
  currentPlan,
  refresh,
  planUpsert,
  planSync,
  planRemove,
  planToggle,
  applyPlan,
  restore,
  closePlan,
} = useMcpServers()

const selectedName = shallowRef('')
const marketPageOpen = shallowRef(false)
const newOpen = shallowRef(false)
const syncSource = shallowRef<McpInstallation | null>(null)

const selectedServer = computed(
  () => servers.value.find((server) => server.name === selectedName.value) ?? null,
)
const syncInstalledTargets = computed<McpTarget[]>(() => {
  const sourceId = syncSource.value?.id
  const sourceServer = sourceId
    ? servers.value.find((server) =>
        server.installations.some((installation) => installation.id === sourceId),
      )
    : null
  return (sourceServer?.installations ?? []).map((installation) => ({
    agent: installation.source.agent,
    surface: installation.source.surface,
    scope: installation.source.scope,
    ...(installation.source.projectRoot
      ? { projectRoot: installation.source.projectRoot }
      : {}),
  }))
})

watch(
  servers,
  (value) => {
    if (!value.some((server) => server.name === selectedName.value)) {
      selectedName.value = value[0]?.name ?? ''
    }
  },
  { immediate: true },
)

onMounted(() => void refresh())

function openSync(installation: McpInstallation): void {
  syncSource.value = installation
}

async function reviewSync(source: McpInstallation, targets: McpTarget[]): Promise<void> {
  const plan = await planSync(source.id, targets)
  if (plan && syncSource.value?.id === source.id) syncSource.value = null
}

async function reviewCreate(
  definition: McpServerDefinition,
  targets: McpTarget[],
): Promise<void> {
  const plan = await planUpsert(definition, targets)
  if (plan) newOpen.value = false
}

function reviewToggle(installationId: string, enabled: boolean): void {
  void planToggle([installationId], enabled)
}

async function executePlan(): Promise<void> {
  const result = await applyPlan()
  if (!result) return
  const succeeded = result.results.filter((item) => item.ok)
  const failed = result.results.filter((item) => !item.ok)
  if (succeeded.length > 0) {
    showToast({
      message: t('mcp.applied', { n: succeeded.length }),
      actionLabel: t('common.undo'),
      onAction: async () => {
        const restored = await restore(result.operationId)
        showToast({ message: restored ? t('common.restored') : t('mcp.restoreFailed') })
      },
    }, 6_000)
  }
  if (failed.length > 0) {
    showToast({ message: failed.map((item) => item.error).filter(Boolean).join('; ') })
  }
}
</script>

<template>
  <McpMarketView
    v-if="marketPageOpen"
    :inset="props.inset"
    @close="marketPageOpen = false"
  />
  <div v-else class="flex h-full min-w-0 flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <div class="app-no-drag relative w-72">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="search" :placeholder="t('mcp.search')" class="pl-8" />
      </div>
      <div class="flex-1" />
      <Button
        variant="outline"
        size="icon"
        class="app-no-drag cursor-pointer"
        :title="t('mcp.market.open')"
        :aria-label="t('mcp.market.open')"
        @click="marketPageOpen = true"
      >
        <Store />
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="app-no-drag cursor-pointer"
        :title="t('mcp.new')"
        :aria-label="t('mcp.new')"
        @click="newOpen = true"
      >
        <Plus />
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="app-no-drag cursor-pointer"
        :disabled="loading"
        :title="t('app.rescan')"
        :aria-label="t('app.rescan')"
        @click="refresh()"
      >
        <RefreshCw :class="loading ? 'animate-spin' : ''" />
      </Button>
    </header>

    <div
      v-if="error"
      class="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-6 py-2 text-sm text-destructive"
    >
      <TriangleAlert class="size-4" />
      {{ error }}
    </div>
    <div
      v-else-if="scanErrors.length"
      class="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-6 py-2 text-sm text-amber-700 dark:text-amber-400"
    >
      <TriangleAlert class="size-4" />
      {{ t('mcp.scanPartial', { n: scanErrors.length }) }}
    </div>

    <div v-if="loading && servers.length === 0" class="grid flex-1 place-items-center">
      <span class="text-sm text-muted-foreground">{{ t('mcp.scanning') }}</span>
    </div>
    <div
      v-else-if="servers.length === 0"
      class="grid flex-1 place-items-center px-6 text-center"
    >
      <div class="flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
        <ServerCog class="size-10" />
        <p class="text-sm font-medium text-foreground">{{ t('mcp.empty') }}</p>
        <div class="flex items-center gap-2">
          <Button size="sm" class="cursor-pointer" @click="newOpen = true">
            <Plus />
            {{ t('mcp.new') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="cursor-pointer"
            @click="marketPageOpen = true"
          >
            <Store />
            {{ t('mcp.market.open') }}
          </Button>
        </div>
      </div>
    </div>
    <div v-else class="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <aside class="min-h-0 overflow-y-auto border-r">
        <p
          v-if="filteredServers.length === 0"
          class="px-4 py-12 text-center text-sm text-muted-foreground"
        >
          {{ t('mcp.noMatch') }}
        </p>
        <McpServerList
          v-else
          :servers="filteredServers"
          :selected-name="selectedName"
          @select="selectedName = $event.name"
        />
      </aside>
      <McpServerDetail
        v-if="selectedServer"
        :server="selectedServer"
        :platforms="platforms"
        :busy="planning || applying"
        @sync="openSync"
        @remove="planRemove"
        @toggle="reviewToggle"
      />
      <div v-else class="grid place-items-center text-sm text-muted-foreground">
        {{ t('mcp.selectOne') }}
      </div>
    </div>

    <McpServerForm
      :open="newOpen"
      :platforms="platforms"
      :project-roots="projectRoots"
      @close="newOpen = false"
      @submit="reviewCreate"
    />
    <McpPlanDialog
      :plan="currentPlan"
      :applying="applying"
      @close="closePlan"
      @apply="executePlan"
    />

    <McpSyncDialog
      :source="syncSource"
      :platforms="platforms"
      :project-roots="projectRoots"
      :installed-targets="syncInstalledTargets"
      :planning="planning"
      @close="syncSource = null"
      @review="reviewSync"
    />
  </div>
</template>
