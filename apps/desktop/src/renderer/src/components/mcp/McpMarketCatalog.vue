<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload, ExternalLink, Search, X } from '@lucide/vue'
import type { McpTarget } from '@skillbuddy/core'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { formatMarketCount, marketIconColor, marketIconGlyph } from '@/lib/market'
import {
  candidatesFromMcpSo,
  candidatesFromModelScope,
  mapMcpSoItem,
  mapModelScopeItem,
  type McpMarketCandidate,
  type McpMarketItem,
  type McpMarketSourceId,
} from '@/lib/mcp-market'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const { projectRoots } = useSettings()
const { servers, platforms, planning, error: mcpError, refresh, planUpsert } = useMcpServers()

/** 魔搭分页约束：page_number * page_size <= 100，接口按 24 条分页，最多加载 4 页。 */
const MODELSCOPE_MAX = 96

const source = shallowRef<McpMarketSourceId>('modelscope')
const query = shallowRef('')
const items = ref<McpMarketItem[]>([])
const total = shallowRef(0)
const page = shallowRef(1)
const loading = shallowRef(false)
const loadingMore = shallowRef(false)
const error = shallowRef<string | null>(null)
const brokenIcons = ref(new Set<string>())

const expandedKey = shallowRef<string | null>(null)
const detailLoading = shallowRef(false)
const candidates = ref<McpMarketCandidate[]>([])
const candidateError = shallowRef<string | null>(null)
const detailMeta = shallowRef<{ sourceUrl: string | null; hosted: boolean; verified: boolean } | null>(null)
const selectedCandidate = shallowRef(0)
const targets = ref<McpTarget[]>([])
let searchRequestId = 0
let detailRequestId = 0

const preferChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
const localNames = computed(() => new Set(servers.value.map((server) => server.name)))
const visibleError = computed(() => error.value ?? mcpError.value)
const canLoadMore = computed(
  () =>
    source.value === 'modelscope' &&
    items.value.length > 0 &&
    items.value.length < Math.min(total.value, MODELSCOPE_MAX),
)
const currentCandidate = computed(() => candidates.value[selectedCandidate.value] ?? null)

async function validatedCandidates(
  values: McpMarketCandidate[],
): Promise<{ accepted: McpMarketCandidate[]; error: string | null }> {
  if (values.length === 0) return { accepted: [], error: null }
  const results = await window.skillsManager.validateMcpMarketDefinitions(
    values.map((candidate) => candidate.definition),
  )
  const accepted = values.filter((_candidate, index) => results[index]?.valid)
  const error = results.find((result) => result && !result.valid)?.error ?? null
  return { accepted, error }
}

async function fetchPage(
  requestedSource: McpMarketSourceId,
  requestedQuery: string,
  pageNumber: number,
  preferChineseNames: boolean,
): Promise<{ items: McpMarketItem[]; total: number }> {
  if (requestedSource === 'modelscope') {
    const result = await window.skillsManager.modelscopeMcpSearch(requestedQuery, pageNumber)
    return {
      items: result.items.map((item) => mapModelScopeItem(item, preferChineseNames)),
      total: result.total,
    }
  }
  const result = await window.skillsManager.mcpsoSearch(requestedQuery)
  return { items: result.items.map(mapMcpSoItem), total: result.items.length }
}

async function search(): Promise<void> {
  const requestId = ++searchRequestId
  const requestedSource = source.value
  const requestedQuery = query.value.trim()
  loading.value = true
  loadingMore.value = false
  error.value = null
  expandedKey.value = null
  detailRequestId += 1
  page.value = 1
  try {
    const result = await fetchPage(requestedSource, requestedQuery, 1, preferChinese.value)
    if (requestId !== searchRequestId) return
    items.value = result.items
    total.value = result.total
  } catch (cause) {
    if (requestId !== searchRequestId) return
    items.value = []
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (requestId === searchRequestId) loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !canLoadMore.value) return
  const requestId = searchRequestId
  const requestedSource = source.value
  const requestedQuery = query.value.trim()
  const nextPage = page.value + 1
  loadingMore.value = true
  try {
    const result = await fetchPage(
      requestedSource,
      requestedQuery,
      nextPage,
      preferChinese.value,
    )
    if (requestId !== searchRequestId) return
    page.value = nextPage
    total.value = result.total
    const known = new Set(items.value.map((item) => item.key))
    items.value = [...items.value, ...result.items.filter((item) => !known.has(item.key))]
  } catch (cause) {
    if (requestId !== searchRequestId) return
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (requestId === searchRequestId) loadingMore.value = false
  }
}

async function toggleExpand(item: McpMarketItem): Promise<void> {
  const requestId = ++detailRequestId
  expandedKey.value = expandedKey.value === item.key ? null : item.key
  candidates.value = []
  candidateError.value = null
  detailMeta.value = null
  selectedCandidate.value = 0
  targets.value = []
  error.value = null
  detailLoading.value = false
  if (expandedKey.value !== item.key) return

  detailLoading.value = true
  try {
    if (item.source === 'modelscope') {
      const detail = await window.skillsManager.modelscopeMcpDetail(item.id)
      if (requestId !== detailRequestId || expandedKey.value !== item.key) return
      const validated = await validatedCandidates(
        candidatesFromModelScope(detail, preferChinese.value),
      )
      if (requestId !== detailRequestId || expandedKey.value !== item.key) return
      candidates.value = validated.accepted
      candidateError.value = validated.error
      detailMeta.value = {
        sourceUrl: detail.sourceUrl,
        hosted: detail.isHosted,
        verified: detail.isVerified,
      }
    } else {
      const detail = await window.skillsManager.mcpsoDetail(item.id)
      if (requestId !== detailRequestId || expandedKey.value !== item.key) return
      const validated = await validatedCandidates(candidatesFromMcpSo(detail, item.description))
      if (requestId !== detailRequestId || expandedKey.value !== item.key) return
      candidates.value = validated.accepted
      candidateError.value = validated.error
      detailMeta.value = { sourceUrl: detail.sourceUrl, hosted: false, verified: false }
    }
  } catch (cause) {
    if (requestId !== detailRequestId || expandedKey.value !== item.key) return
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}

async function reviewInstall(): Promise<void> {
  const candidate = currentCandidate.value
  if (!candidate || targets.value.length === 0) return
  const plan = await planUpsert(candidate.definition, targets.value)
  // 计划生成后关闭目录，由父视图的 McpPlanDialog 接管确认与应用
  if (plan) emit('close')
}

function openPage(url: string): void {
  void window.skillsManager.openLink(url)
}

watch(source, () => void search())
watch(
  () => props.open,
  (open) => {
    if (!open) {
      searchRequestId += 1
      detailRequestId += 1
      loading.value = false
      loadingMore.value = false
      detailLoading.value = false
      expandedKey.value = null
      candidates.value = []
      candidateError.value = null
      detailMeta.value = null
      return
    }
    void refresh({ silent: true })
    void search()
  },
)
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,88vh)] w-[min(780px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start justify-between gap-4 border-b px-5 py-4">
          <span>
            <DialogTitle class="text-base font-semibold">{{ t('mcp.market.title') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('mcp.market.description') }}
            </DialogDescription>
          </span>
          <button
            type="button"
            class="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="t('common.cancel')"
            :aria-label="t('common.cancel')"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="flex items-center gap-3 px-5 pt-4">
          <div class="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-muted p-1">
            <button
              type="button"
              :class="[
                'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
                source === 'modelscope'
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground',
              ]"
              @click="source = 'modelscope'"
            >
              {{ t('mcp.market.sourceModelScope') }}
            </button>
            <button
              type="button"
              :class="[
                'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
                source === 'mcp-so'
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground',
              ]"
              @click="source = 'mcp-so'"
            >
              {{ t('mcp.market.sourceMcpSo') }}
            </button>
          </div>
          <div class="relative flex-1">
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="query"
              :placeholder="t('mcp.market.searchPh')"
              class="pl-8"
              @keydown.enter="search"
            />
          </div>
        </div>

        <p v-if="visibleError" class="break-all px-5 pt-3 text-sm text-destructive">
          {{ visibleError }}
        </p>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div v-if="loading" class="flex flex-col gap-2">
            <Skeleton v-for="index in 6" :key="index" class="h-16 rounded-md" />
          </div>
          <p
            v-else-if="items.length === 0"
            class="py-16 text-center text-sm text-muted-foreground"
          >
            {{ t('mcp.market.empty') }}
          </p>

          <ul v-else class="flex flex-col gap-2">
            <li v-for="item in items" :key="item.key" class="rounded-md border px-4 py-3">
              <div class="flex items-start gap-3">
                <img
                  v-if="item.icon && !brokenIcons.has(item.key)"
                  :src="item.icon"
                  alt=""
                  class="size-9 shrink-0 rounded-md border object-cover"
                  loading="lazy"
                  @error="brokenIcons.add(item.key)"
                />
                <span
                  v-else
                  :class="[
                    'grid size-9 shrink-0 place-items-center rounded-md text-sm font-semibold text-white',
                    marketIconColor(item.name),
                  ]"
                >
                  {{ marketIconGlyph(item.name) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="select-text text-sm font-medium">{{ item.name }}</span>
                    <span v-if="item.author" class="text-xs text-muted-foreground">
                      {{ item.author }}
                    </span>
                    <span
                      v-if="item.viewCount"
                      class="text-xs tabular-nums text-muted-foreground"
                    >
                      {{ t('mcp.market.views', { n: formatMarketCount(item.viewCount) }) }}
                    </span>
                  </div>
                  <p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {{ item.description || t('card.noDescription') }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    class="cursor-pointer"
                    :title="t('mcp.market.openPage')"
                    :aria-label="t('mcp.market.openPage')"
                    @click="openPage(item.link)"
                  >
                    <ExternalLink />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="cursor-pointer"
                    @click="toggleExpand(item)"
                  >
                    <CloudDownload />
                    {{ t('mcp.market.install') }}
                  </Button>
                </div>
              </div>

              <div
                v-if="expandedKey === item.key"
                class="mt-3 flex flex-col gap-3 border-t pt-3"
              >
                <div
                  v-if="detailLoading"
                  class="py-4 text-center text-sm text-muted-foreground"
                >
                  …
                </div>
                <div
                  v-else-if="candidates.length === 0"
                  class="flex flex-col items-start gap-2 py-2"
                >
                  <p class="text-sm text-muted-foreground">
                    {{
                      candidateError
                        ? t('mcp.market.invalidConfig', { msg: candidateError })
                        : t('mcp.market.noConfig')
                    }}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    class="cursor-pointer"
                    @click="openPage(item.link)"
                  >
                    <ExternalLink />
                    {{ t('mcp.market.openPage') }}
                  </Button>
                </div>
                <template v-else>
                  <div v-if="detailMeta" class="flex flex-wrap items-center gap-1.5">
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

                  <div v-if="candidates.length > 1" class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium">{{ t('mcp.market.configPick') }}</span>
                    <button
                      v-for="(candidate, index) in candidates"
                      :key="candidate.serverName + candidate.label"
                      type="button"
                      :class="[
                        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
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
                    </button>
                  </div>
                  <div v-else-if="currentCandidate" class="flex items-center gap-2 text-sm">
                    <span class="shrink-0 font-medium">{{ currentCandidate.serverName }}</span>
                    <code class="truncate text-xs text-muted-foreground">
                      {{ currentCandidate.label }}
                    </code>
                    <Badge
                      v-if="localNames.has(currentCandidate.serverName)"
                      variant="success"
                    >
                      {{ t('mcp.market.installed') }}
                    </Badge>
                  </div>

                  <div
                    v-if="currentCandidate && currentCandidate.definition.requiredSecrets.length"
                    class="flex flex-col gap-1.5"
                  >
                    <span class="text-xs text-muted-foreground">
                      {{ t('mcp.market.secretsHint') }}
                    </span>
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

                  <div class="flex flex-col gap-2">
                    <span class="text-sm font-medium">{{ t('mcp.form.targets') }}</span>
                    <McpTargetPicker
                      v-model="targets"
                      :platforms="platforms"
                      :project-roots="projectRoots"
                    />
                  </div>
                  <Button
                    size="sm"
                    class="w-fit cursor-pointer"
                    :disabled="planning || targets.length === 0 || !currentCandidate"
                    @click="reviewInstall"
                  >
                    {{ t('mcp.form.review') }}
                  </Button>
                </template>
              </div>
            </li>
          </ul>

          <div v-if="canLoadMore" class="mt-3 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              class="cursor-pointer"
              :disabled="loadingMore"
              @click="loadMore"
            >
              {{ t('mcp.market.loadMore') }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
