<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload, KeyRound, Search, ServerCog } from '@lucide/vue'
import type {
  McpTarget,
  RegistryMcpServer,
  RegistryMcpServerSummary,
} from '@skillbuddy/core'
import type { RegistryConfig } from '../../../../shared/ipc.js'
import CopyButton from '@/components/CopyButton.vue'
import McpPlanDialog from '@/components/mcp/McpPlanDialog.vue'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { showToast } from '@/composables/useToast'

const props = defineProps<{ config: RegistryConfig }>()
const { t } = useI18n()
const { projectRoots } = useSettings()
const {
  servers,
  platforms,
  planning,
  applying,
  error: mcpError,
  currentPlan,
  refresh,
  planUpsert,
  applyPlan,
  restore,
  closePlan,
} = useMcpServers()

const query = shallowRef('')
const items = ref<RegistryMcpServerSummary[]>([])
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)
const expanded = shallowRef<string | null>(null)
const detail = ref<RegistryMcpServer | null>(null)
const detailLoading = shallowRef(false)
const targets = ref<McpTarget[]>([])

const localNames = computed(() => new Set(servers.value.map((server) => server.name)))
const visibleError = computed(() => error.value ?? mcpError.value)

async function search(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    items.value = await window.skillsManager.registryMcpSearch(
      props.config,
      query.value || undefined,
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function toggleExpand(item: RegistryMcpServerSummary): Promise<void> {
  const key = `${item.org}/${item.name}`
  expanded.value = expanded.value === key ? null : key
  detail.value = null
  targets.value = []
  error.value = null
  if (expanded.value !== key) return

  detailLoading.value = true
  try {
    detail.value = await window.skillsManager.registryMcpGet(
      props.config,
      item.org,
      item.name,
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    detailLoading.value = false
  }
}

async function reviewInstall(): Promise<void> {
  if (!detail.value || targets.value.length === 0) return
  await planUpsert(detail.value.definition, targets.value)
}

async function executePlan(): Promise<void> {
  const result = await applyPlan()
  if (!result) return
  const succeeded = result.results.filter((item) => item.ok)
  const failed = result.results.filter((item) => !item.ok)
  if (succeeded.length > 0) {
    expanded.value = null
    showToast(
      {
        message: t('mcp.applied', { n: succeeded.length }),
        actionLabel: t('common.undo'),
        onAction: async () => {
          const restored = await restore(result.operationId)
          showToast({ message: restored ? t('common.restored') : t('mcp.restoreFailed') })
        },
      },
      60_000,
    )
  }
  if (failed.length > 0) {
    showToast({ message: failed.map((item) => item.error).filter(Boolean).join('; ') })
  }
}

onMounted(() => {
  void Promise.all([search(), refresh({ silent: servers.value.length > 0 })])
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="query"
        :placeholder="t('team.mcpSearchPh')"
        class="pl-8"
        @keydown.enter="search"
      />
    </div>

    <p v-if="visibleError" class="break-all text-sm text-destructive">
      {{ t('team.error', { msg: visibleError }) }}
    </p>
    <div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">…</div>
    <p v-else-if="items.length === 0" class="py-16 text-center text-sm text-muted-foreground">
      {{ t('team.mcpEmpty') }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="item in items"
        :key="`${item.org}/${item.name}`"
        class="rounded-md border px-4 py-3"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
              <ServerCog class="size-4 text-muted-foreground" />
              <span class="select-text">
                <span class="text-muted-foreground">{{ item.org }}/</span>{{ item.name }}
              </span>
              <CopyButton :text="`${item.org}/${item.name}`" />
              <Badge variant="outline">v{{ item.version }}</Badge>
              <Badge variant="secondary">{{ item.transport }}</Badge>
            </span>
            <span class="line-clamp-1 text-sm text-muted-foreground">
              {{ item.description || t('card.noDescription') }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge v-if="localNames.has(item.name)" variant="success">{{ t('team.installed') }}</Badge>
            <Button variant="outline" size="sm" @click="toggleExpand(item)">
              <CloudDownload />
              {{ t('team.install') }}
            </Button>
          </div>
        </div>

        <div
          v-if="expanded === `${item.org}/${item.name}`"
          class="mt-3 flex flex-col gap-3 border-t pt-3"
        >
          <div v-if="detailLoading" class="py-4 text-center text-sm text-muted-foreground">…</div>
          <template v-else-if="detail">
            <div class="grid gap-2 rounded-md border bg-muted/20 px-3 py-3 text-sm sm:grid-cols-2">
              <span>
                <span class="block text-xs text-muted-foreground">{{ t('mcp.transport') }}</span>
                <code>{{ detail.definition.transport.kind }}</code>
              </span>
              <span>
                <span class="block text-xs text-muted-foreground">{{ t('team.publishedBy') }}</span>
                {{ detail.publishedBy }}
              </span>
              <span class="min-w-0 sm:col-span-2">
                <span class="block text-xs text-muted-foreground">
                  {{ detail.definition.transport.kind === 'stdio' ? t('mcp.command') : t('mcp.endpoint') }}
                </span>
                <code class="block truncate">
                  {{ detail.definition.transport.kind === 'stdio' ? detail.definition.transport.command : detail.definition.transport.url }}
                </code>
              </span>
            </div>

            <div class="flex flex-col gap-2">
              <span class="flex items-center gap-2 text-sm font-medium">
                <KeyRound class="size-4" />
                {{ t('team.requiredSecrets') }}
              </span>
              <div v-if="detail.requiredSecrets.length" class="flex flex-wrap gap-1.5">
                <Badge v-for="secret in detail.requiredSecrets" :key="secret" variant="outline">
                  {{ secret }}
                </Badge>
              </div>
              <p v-else class="text-sm text-muted-foreground">{{ t('team.noRequiredSecrets') }}</p>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium">{{ t('team.mcpTargets') }}</span>
              <McpTargetPicker
                v-model="targets"
                :platforms="platforms"
                :project-roots="projectRoots"
              />
            </div>
            <Button
              size="sm"
              class="w-fit"
              :disabled="planning || applying || targets.length === 0"
              @click="reviewInstall"
            >
              {{ planning ? t('team.preparingPlan') : t('team.reviewMcpInstall') }}
            </Button>
          </template>
        </div>
      </li>
    </ul>

    <McpPlanDialog
      :plan="currentPlan"
      :applying="applying"
      @close="closePlan"
      @apply="executePlan"
    />
  </div>
</template>
