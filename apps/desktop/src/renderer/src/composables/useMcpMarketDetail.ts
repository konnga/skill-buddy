import { computed, onMounted, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import type { McpTarget } from '@skillbuddy/core'
import type { TeamLibraryMcpDraft } from '#shared/ipc'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import {
  candidatesFromMcpSo,
  candidatesFromModelScope,
  type McpMarketCandidate,
  type McpMarketItem,
} from '@/lib/mcp-market'
import { cachedMcpMarketRequest, mcpMarketCacheKey } from '@/lib/mcp-market-cache'

export interface McpMarketDetailMeta {
  sourceUrl: string | null
  hosted: boolean
  verified: boolean
}

interface UseMcpMarketDetailOptions {
  item: MaybeRefOrGetter<McpMarketItem>
  actionError?: MaybeRefOrGetter<string | null | undefined>
  existingNames?: MaybeRefOrGetter<readonly string[] | undefined>
}

export function useMcpMarketDetail(options: UseMcpMarketDetailOptions) {
  const { t, locale } = useI18n()
  const { projectRoots } = useSettings()
  const { servers, platforms, planning, error: mcpError, planUpsert, refresh } = useMcpServers()
  const loading = shallowRef(true)
  const error = shallowRef<string | null>(null)
  const candidates = ref<McpMarketCandidate[]>([])
  const candidateError = shallowRef<string | null>(null)
  const detailMeta = shallowRef<McpMarketDetailMeta | null>(null)
  const overview = shallowRef('')
  const selectedCandidate = shallowRef(0)
  const targets = ref<McpTarget[]>([])
  let detailRequestId = 0

  const item = computed(() => toValue(options.item))
  const preferChinese = computed(() => locale.value.toLowerCase().startsWith('zh'))
  const localNames = computed(() => new Set(servers.value.map((server) => server.name)))
  const visibleError = computed(() => {
    const actionError = options.actionError ? toValue(options.actionError) : null
    if (actionError) return actionError
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
  const alreadyInTeamLibrary = computed(() => {
    const existingNames = options.existingNames ? toValue(options.existingNames) : undefined
    return Boolean(currentCandidate.value && existingNames?.includes(currentCandidate.value.serverName))
  })

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
    const requestId = ++detailRequestId
    loading.value = true
    error.value = null
    candidates.value = []
    candidateError.value = null
    detailMeta.value = null
    overview.value = ''
    selectedCandidate.value = 0
    targets.value = []
    try {
      if (item.value.source === 'modelscope') {
        const detail = await cachedMcpMarketRequest(
          mcpMarketCacheKey('modelscope-detail', item.value.id),
          () => window.skillsManager.modelscopeMcpDetail(item.value.id),
        )
        const validated = await validatedCandidates(
          candidatesFromModelScope(detail, preferChinese.value),
        )
        if (requestId !== detailRequestId) return
        candidates.value = validated.accepted
        candidateError.value = validated.error
        overview.value = detail.readme?.trim() || detail.description?.trim() || ''
        detailMeta.value = {
          sourceUrl: detail.sourceUrl,
          hosted: detail.isHosted,
          verified: detail.isVerified,
        }
        return
      }

      const detail = await cachedMcpMarketRequest(
        mcpMarketCacheKey('mcpso-detail', item.value.id),
        () => window.skillsManager.mcpsoDetail(item.value.id),
      )
      const validated = await validatedCandidates(
        candidatesFromMcpSo(detail, item.value.description),
      )
      if (requestId !== detailRequestId) return
      candidates.value = validated.accepted
      candidateError.value = validated.error
      overview.value = detail.description?.trim() || ''
      detailMeta.value = { sourceUrl: detail.sourceUrl, hosted: false, verified: false }
    } catch (cause) {
      if (requestId !== detailRequestId) return
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (requestId === detailRequestId) loading.value = false
    }
  }

  function openPage(url: string): void {
    void window.skillsManager.openLink(url)
  }

  function setSelectedCandidate(value: number): void {
    selectedCandidate.value = value
  }

  function setTargets(value: McpTarget[]): void {
    targets.value = value
  }

  async function reviewInstall(): Promise<boolean> {
    if (!currentCandidate.value || targets.value.length === 0) return false
    const plan = await planUpsert(currentCandidate.value.definition, targets.value)
    return plan !== null
  }

  function createTeamLibraryDraft(): TeamLibraryMcpDraft | null {
    if (!currentCandidate.value || alreadyInTeamLibrary.value) return null
    return {
      description: currentCandidate.value.definition.description ?? item.value.description,
      definition: currentCandidate.value.definition,
    }
  }

  onMounted(() => {
    void refresh({ silent: true })
    void loadDetail()
  })

  watch(
    () => item.value.key,
    () => void loadDetail(),
  )

  return {
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
  }
}
