<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ShieldCheck } from '@lucide/vue'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketItem } from '@/lib/market'

interface VersionEntry {
  version: string
  changelog: string
  createdAt: number | null
  security: { name: string; status: string; statusText: string; reportUrl: string }[]
}

const props = defineProps<{
  active: boolean
  item: MarketItem
}>()

const { t } = useI18n()
const versions = ref<VersionEntry[] | null>(null)
const loading = shallowRef(false)
let loadedItemKey: string | null = null
let observedItemKey = props.item.key
let requestId = 0

/** 按市场条目缓存版本响应，并丢弃条目切换后返回的过期异步结果。 */
async function loadVersions(): Promise<void> {
  if (
    !props.active ||
    props.item.kind !== 'skillhub' ||
    loading.value ||
    loadedItemKey === props.item.key
  ) return

  const itemKey = props.item.key
  const currentRequestId = ++requestId
  loading.value = true
  versions.value = null
  try {
    const result = await window.skillsManager.skillhubVersions(
      props.item.slug!,
      props.item.namespace ?? '',
    )
    if (requestId !== currentRequestId || props.item.key !== itemKey) return
    versions.value = result
    loadedItemKey = itemKey
  } catch {
    if (requestId !== currentRequestId || props.item.key !== itemKey) return
    versions.value = []
    loadedItemKey = itemKey
  } finally {
    if (requestId === currentRequestId) loading.value = false
  }
}

function formatDate(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function openReport(url: string): void {
  if (url) void window.skillsManager.openLink(url)
}

watch(
  [() => props.active, () => props.item.key],
  ([active, itemKey]) => {
    if (itemKey !== observedItemKey) {
      requestId += 1
      loading.value = false
      versions.value = null
      loadedItemKey = null
      observedItemKey = itemKey
    }
    if (active) void loadVersions()
  },
  { immediate: true },
)
</script>

<template>
  <section>
    <div v-if="loading || versions === null" class="flex flex-col py-2">
      <div v-for="index in 3" :key="index" :class="['flex flex-col gap-2 py-4', index > 1 && 'border-t']">
        <div class="flex items-center gap-3">
          <Skeleton class="h-4 w-16" />
          <div class="flex-1" />
          <Skeleton class="h-3 w-20" />
        </div>
        <Skeleton class="h-4 w-2/3" />
        <div class="flex gap-2">
          <Skeleton class="h-5 w-24 rounded-full" />
          <Skeleton class="h-5 w-24 rounded-full" />
        </div>
      </div>
    </div>
    <p v-else-if="versions.length === 0" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('market.versionsEmpty') }}
    </p>
    <ul v-else class="flex flex-col">
      <li
        v-for="(version, index) in versions"
        :key="version.version"
        :class="['flex flex-col gap-1.5 py-4', index > 0 && 'border-t']"
      >
        <div class="flex items-center gap-3">
          <span class="text-sm font-semibold tabular-nums">v{{ version.version }}</span>
          <span
            v-if="index === 0"
            class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
          >
            {{ t('market.latest') }}
          </span>
          <div class="flex-1" />
          <span v-if="version.createdAt" class="text-sm tabular-nums text-muted-foreground">
            {{ formatDate(version.createdAt) }}
          </span>
        </div>
        <p v-if="version.changelog" class="select-text text-sm text-foreground/80">
          {{ version.changelog }}
        </p>
        <div v-if="version.security.length > 0" class="flex flex-wrap items-center gap-2">
          <button
            v-for="report in version.security"
            :key="report.name"
            type="button"
            :class="[
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
              report.status === 'benign'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground',
              report.reportUrl ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
            ]"
            :title="report.reportUrl ? t('market.viewReport') : undefined"
            @click="openReport(report.reportUrl)"
          >
            <ShieldCheck v-if="report.status === 'benign'" class="size-3" />
            {{ report.name }} · {{ report.statusText || report.status }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
