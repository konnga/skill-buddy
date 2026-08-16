<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, CloudDownload, ExternalLink, LibraryBig } from '@lucide/vue'
import type { McpTarget } from '@skillbuddy/core'
import type { TeamLibraryMcpDraft } from '../../../../shared/ipc.js'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import MarkdownView from '@/components/MarkdownView.vue'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import {
  candidatesFromMcpSo,
  candidatesFromModelScope,
  type McpMarketCandidate,
  type McpMarketItem,
} from '@/lib/mcp-market'
import { cachedMcpMarketRequest, mcpMarketCacheKey } from '@/lib/mcp-market-cache'

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

const { t, locale } = useI18n()
const { projectRoots } = useSettings()
const { servers, platforms, planning, error: mcpError, planUpsert, refresh } = useMcpServers()

const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
const candidates = shallowRef<McpMarketCandidate[]>([])
const candidateError = shallowRef<string | null>(null)
const detailMeta = shallowRef<{
  sourceUrl: string | null
  hosted: boolean
  verified: boolean
} | null>(null)
const overview = shallowRef('')
const selectedCandidate = shallowRef(0)
const targets = shallowRef<McpTarget[]>([])

const preferChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
const localNames = computed(() => new Set(servers.value.map((server) => server.name)))
const visibleError = computed(() => {
  if (props.actionError) return props.actionError
  if (error.value) {
    return t(
      /(?:^|\D)404(?:\D|$)/.test(error.value)
        ? 'mcp.market.detailNotFound'
        : 'mcp.market.detailLoadFailed',
    )
  }
  return mcpError.value
})
const currentCandidate = computed(() => candidates.value[selectedCandidate.value] ?? null)
const alreadyInTeamLibrary = computed(() =>
  Boolean(currentCandidate.value && props.existingNames?.includes(currentCandidate.value.serverName)),
)

async function validatedCandidates(
  values: McpMarketCandidate[],
): Promise<{ accepted: McpMarketCandidate[]; error: string | null }> {
  if (values.length === 0) return { accepted: [], error: null }
  const results = await window.skillsManager.validateMcpMarketDefinitions(
    values.map((candidate) => candidate.definition),
  )
  return {
    accepted: values.filter((_candidate, index) => results[index]?.valid),
    error: results.find((result) => result && !result.valid)?.error ?? null,
  }
}

async function loadDetail(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (props.item.source === 'modelscope') {
      const detail = await cachedMcpMarketRequest(
        mcpMarketCacheKey('modelscope-detail', props.item.id),
        () => window.skillsManager.modelscopeMcpDetail(props.item.id),
      )
      const validated = await validatedCandidates(
        candidatesFromModelScope(detail, preferChinese.value),
      )
      candidates.value = validated.accepted
      candidateError.value = validated.error
      overview.value = detail.readme?.trim() || detail.description?.trim() || ''
      detailMeta.value = {
        sourceUrl: detail.sourceUrl,
        hosted: detail.isHosted,
        verified: detail.isVerified,
      }
    } else {
      const detail = await cachedMcpMarketRequest(
        mcpMarketCacheKey('mcpso-detail', props.item.id),
        () => window.skillsManager.mcpsoDetail(props.item.id),
      )
      const validated = await validatedCandidates(
        candidatesFromMcpSo(detail, props.item.description),
      )
      candidates.value = validated.accepted
      candidateError.value = validated.error
      overview.value = detail.description?.trim() || ''
      detailMeta.value = { sourceUrl: detail.sourceUrl, hosted: false, verified: false }
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

function openPage(url: string): void {
  void window.skillsManager.openLink(url)
}

async function reviewInstall(): Promise<void> {
  if (!currentCandidate.value || targets.value.length === 0) return
  const plan = await planUpsert(currentCandidate.value.definition, targets.value)
  if (plan) emit('reviewed')
}

function addToTeamLibrary(): void {
  if (!currentCandidate.value || alreadyInTeamLibrary.value) return
  emit('addToTeamLibrary', {
    description: currentCandidate.value.definition.description ?? props.item.description,
    definition: currentCandidate.value.definition,
  })
}

onMounted(() => {
  void refresh({ silent: true })
  void loadDetail()
})
</script>

<template>
  <div :class="['flex min-w-0 flex-col', installOnly ? 'min-h-0 flex-1' : 'h-full']">
    <header
      v-if="!installOnly"
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
      <h1 class="min-w-0 truncate text-base font-semibold">{{ item.name }}</h1>
      <div class="flex-1" />
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag cursor-pointer"
        @click="openPage(item.link)"
      >
        <ExternalLink />
        {{ t('mcp.market.openPage') }}
      </Button>
    </header>

    <ScrollArea
      class="flex-1"
      :viewport-class="installOnly ? 'px-5 py-4' : 'px-6 py-6'"
    >
      <div
        :class="[
          'mx-auto flex flex-col gap-5',
          installOnly ? 'max-w-none' : 'max-w-3xl',
        ]"
      >
        <div v-if="!installOnly" class="flex items-start gap-4">
          <img
            v-if="item.icon"
            :src="item.icon"
            alt=""
            class="size-16 shrink-0 rounded-xl border object-cover"
          />
          <div class="min-w-0">
            <h2 class="text-2xl font-semibold">{{ item.name }}</h2>
            <p v-if="item.author" class="mt-1 text-sm text-muted-foreground">{{ item.author }}</p>
            <p v-if="item.description" class="mt-3 text-sm leading-6 text-foreground/85">
              {{ item.description }}
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
        <section
          v-if="!loading && !error"
          :class="[
            'flex flex-col gap-4',
            !installOnly && 'rounded-lg border p-5',
          ]"
        >
          <div v-if="detailMeta" class="flex flex-wrap items-center gap-2">
            <Badge v-if="detailMeta.hosted" variant="secondary">
              {{ t('mcp.market.hosted') }}
            </Badge>
            <Badge v-if="detailMeta.verified" variant="success">
              {{ t('mcp.market.verified') }}
            </Badge>
            <button
              v-if="detailMeta.sourceUrl"
              type="button"
              class="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
              @click="openPage(detailMeta.sourceUrl)"
            >
              {{ t('market.viewSource') }}
            </button>
          </div>

          <p v-if="candidates.length === 0" class="text-sm text-muted-foreground">
            {{
              candidateError
                ? t('mcp.market.invalidConfig', { msg: candidateError })
                : t('mcp.market.noConfig')
            }}
          </p>
          <template v-else>
            <div v-if="candidates.length > 1" class="flex flex-col gap-2">
              <span class="text-sm font-medium">{{ t('mcp.market.configPick') }}</span>
              <button
                v-for="(candidate, index) in candidates"
                :key="candidate.serverName + candidate.label"
                type="button"
                :class="[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm',
                  index === selectedCandidate
                    ? 'border-foreground/40 bg-muted/40'
                    : 'text-muted-foreground hover:bg-accent/60',
                ]"
                @click="selectedCandidate = index"
              >
                <span class="shrink-0 font-medium">{{ candidate.serverName }}</span>
                <code class="truncate text-xs">{{ candidate.label }}</code>
                <Badge
                  v-if="localNames.has(candidate.serverName)"
                  variant="success"
                  class="ml-auto"
                >
                  {{ t('mcp.market.installed') }}
                </Badge>
                <Badge
                  v-if="existingNames?.includes(candidate.serverName)"
                  variant="secondary"
                  :class="!localNames.has(candidate.serverName) && 'ml-auto'"
                >
                  已在团队库
                </Badge>
              </button>
            </div>
            <div v-else-if="currentCandidate" class="flex items-center gap-2 text-sm">
              <span class="font-medium">{{ currentCandidate.serverName }}</span>
              <code class="truncate text-xs text-muted-foreground">
                {{ currentCandidate.label }}
              </code>
            </div>

            <div
              v-if="currentCandidate?.definition.requiredSecrets.length"
              class="flex flex-col gap-1.5"
            >
              <span class="text-xs text-muted-foreground">{{ t('mcp.market.secretsHint') }}</span>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="secret in currentCandidate.definition.requiredSecrets"
                  :key="secret"
                  variant="outline"
                >
                  {{ secret }}
                </Badge>
              </div>
            </div>
            <div v-if="!teamLibraryMode" class="flex flex-col gap-2">
              <span class="text-sm font-medium">{{ t('mcp.form.targets') }}</span>
              <McpTargetPicker
                v-model="targets"
                :platforms="platforms"
                :project-roots="projectRoots"
              />
            </div>
            <Button
              v-if="!installOnly && !teamLibraryMode"
              size="sm"
              class="w-fit cursor-pointer"
              :disabled="planning || targets.length === 0 || !currentCandidate"
              @click="reviewInstall"
            >
              <CloudDownload />
              {{ t('mcp.form.review') }}
            </Button>
          </template>
        </section>

        <section v-if="!installOnly && !loading && !error" class="rounded-lg border p-5">
          <h2 class="text-base font-semibold">{{ t('mcp.market.overview') }}</h2>
          <div v-if="overview" class="mt-4">
            <MarkdownView :content="overview" preview-id="mcp-market-overview" />
          </div>
          <p v-else class="mt-4 text-sm text-muted-foreground">
            {{ t('mcp.market.overviewEmpty') }}
          </p>
        </section>
      </div>
    </ScrollArea>

    <footer
      v-if="installOnly && !loading && candidates.length > 0"
      class="flex shrink-0 justify-end border-t px-5 py-4"
    >
      <Button
        size="sm"
        class="cursor-pointer"
        :disabled="teamLibraryMode ? actionBusy || alreadyInTeamLibrary || !currentCandidate : planning || targets.length === 0 || !currentCandidate"
        @click="teamLibraryMode ? addToTeamLibrary() : reviewInstall()"
      >
        <LibraryBig v-if="teamLibraryMode" />
        <CloudDownload v-else />
        {{
          teamLibraryMode
            ? alreadyInTeamLibrary
              ? '已在团队库'
              : actionBusy
                ? '正在加入…'
                : '加入团队库'
            : t('mcp.form.review')
        }}
      </Button>
    </footer>
  </div>
</template>
