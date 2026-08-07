<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, KeyRound, Plus, Search, Star } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatMarketCount,
  marketIconColor,
  marketIconGlyph,
  type MarketItem,
  type MarketSourceId,
} from '@/lib/market'

const emit = defineEmits<{ open: [item: MarketItem] }>()

const { t } = useI18n()

const source = ref<MarketSourceId>('skills-sh')
const query = ref('')
const items = ref<MarketItem[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const brokenIcons = ref<Set<string>>(new Set())

function iconFailed(key: string): void {
  brokenIcons.value = new Set(brokenIcons.value).add(key)
}

/** skills.sh search requires >= 2 chars; use a broad default feed */
const DEFAULT_QUERY = 'ai'
const PAGE_SIZE = 24

/* pagination state */
/** skills.sh: full result cached, revealed in chunks (its API has no pagination) */
let skshAll: MarketItem[] = []
/** skillhub: server-side pages */
let hubPage = 1
let hubTotal = 0
const hasMore = ref(false)

function mapSkillsSh(
  list: Awaited<ReturnType<typeof window.skillsManager.marketSearch>>,
): MarketItem[] {
  return list.map((s) => ({
    key: `sksh:${s.id}`,
    kind: 'skills-sh' as const,
    name: s.name,
    description: '',
    installs: s.installs,
    stars: null,
    icon: `https://github.com/${s.source.split('/')[0]}.png?size=96`,
    sourceLabel: s.source,
    link: `https://github.com/${s.source}`,
    repo: s.source,
    skillId: s.skillId,
  }))
}

function mapSkillhub(
  list: Awaited<ReturnType<typeof window.skillsManager.skillhubSearch>>['items'],
): MarketItem[] {
  return list.map((s) => ({
    key: `hub:${s.namespace}/${s.slug}`,
    kind: 'skillhub' as const,
    name: s.name,
    description: s.description,
    installs: s.installs,
    stars: s.stars,
    icon: s.iconUrl,
    sourceLabel: s.canonicalName,
    link:
      s.upstreamUrl ??
      `https://skillhub.cn/skills/${encodeURIComponent(s.namespace)}/${encodeURIComponent(s.slug)}`,
    slug: s.slug,
    namespace: s.namespace,
    version: s.version,
    updatedAt: s.updatedAt,
    verified: s.verified,
    requiresApiKey: s.requiresApiKey,
    tags: s.tags,
  }))
}

/** resolve GitHub stars for a batch of skills.sh cards (cached in main) */
function fillStars(batch: MarketItem[]): void {
  const repos = [...new Set(batch.map((b) => b.repo).filter(Boolean))] as string[]
  if (repos.length === 0) return
  void window.skillsManager.githubStars(repos).then((stars) => {
    items.value = items.value.map((it) =>
      it.kind === 'skills-sh' && it.repo && stars[it.repo] !== undefined
        ? { ...it, stars: stars[it.repo]! }
        : it,
    )
  })
}

async function search(): Promise<void> {
  loading.value = true
  error.value = null
  items.value = []
  hasMore.value = false
  try {
    if (source.value === 'skills-sh') {
      const term = query.value.trim() || DEFAULT_QUERY
      skshAll = mapSkillsSh(await window.skillsManager.marketSearch(term))
      const first = skshAll.slice(0, PAGE_SIZE)
      items.value = first
      hasMore.value = skshAll.length > first.length
      fillStars(first)
    } else {
      hubPage = 1
      const { items: list, total } = await window.skillsManager.skillhubSearch(
        query.value.trim(),
        hubPage,
      )
      items.value = mapSkillhub(list)
      hubTotal = total
      hasMore.value = items.value.length < hubTotal
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    if (source.value === 'skills-sh') {
      const next = skshAll.slice(items.value.length, items.value.length + PAGE_SIZE)
      items.value = [...items.value, ...next]
      hasMore.value = skshAll.length > items.value.length
      fillStars(next)
    } else {
      hubPage += 1
      const { items: list, total } = await window.skillsManager.skillhubSearch(
        query.value.trim(),
        hubPage,
      )
      hubTotal = total
      const known = new Set(items.value.map((i) => i.key))
      items.value = [...items.value, ...mapSkillhub(list).filter((i) => !known.has(i.key))]
      hasMore.value = list.length > 0 && items.value.length < hubTotal
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingMore.value = false
  }
}

/* infinite scroll sentinel */
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    },
    { rootMargin: '200px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
  void search()
})

watch(sentinel, (el, prev) => {
  if (prev) observer?.unobserve(prev)
  if (el) observer?.observe(el)
})

onUnmounted(() => observer?.disconnect())

watch(source, () => void search())
</script>

<template>
  <section>
    <div class="mb-3 flex items-center gap-2">
      <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('market.title') }}
      </h3>
      <div class="flex-1" />
      <button
        :class="[
          'rounded-md px-2.5 py-1 text-xs transition-colors',
          source === 'skills-sh' ? 'nav-active' : 'text-muted-foreground hover:bg-accent/60',
        ]"
        @click="source = 'skills-sh'"
      >
        {{ t('market.sourceSkillsSh') }}
      </button>
      <button
        :class="[
          'rounded-md px-2.5 py-1 text-xs transition-colors',
          source === 'skillhub' ? 'nav-active' : 'text-muted-foreground hover:bg-accent/60',
        ]"
        @click="source = 'skillhub'"
      >
        {{ t('market.sourceSkillhub') }}
      </button>
    </div>

    <div class="relative mb-3">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="query"
        :placeholder="
          source === 'skills-sh' ? t('market.searchPh') : t('market.searchSkillhubPh')
        "
        class="pl-8"
        @keydown.enter="search()"
      />
    </div>

    <p v-if="error" class="mb-2 break-all text-xs text-destructive">{{ error }}</p>

    <ul v-if="loading" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
      <li v-for="i in 8" :key="i">
        <div class="flex h-full flex-col rounded-2xl border bg-card px-3.5 py-3.5">
          <div class="flex items-center gap-2.5">
            <Skeleton class="size-8 shrink-0 rounded-full" />
            <Skeleton class="h-4 flex-1" />
            <Skeleton class="size-7 shrink-0 rounded-lg" />
          </div>
          <Skeleton class="mt-3 h-3 w-full" />
          <Skeleton class="mt-1.5 h-3 w-3/4" />
          <div class="mt-3 flex gap-3">
            <Skeleton class="h-3 w-10" />
            <Skeleton class="h-3 w-10" />
          </div>
        </div>
      </li>
    </ul>
    <p v-else-if="items.length === 0" class="py-10 text-center text-sm text-muted-foreground">
      {{ t('market.empty') }}
    </p>

    <template v-else>
      <ul class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <li v-for="item in items" :key="item.key">
          <div
            class="group flex h-full cursor-pointer flex-col rounded-2xl border bg-card px-3.5 py-3.5 transition-colors hover:border-foreground/25"
            role="button"
            tabindex="0"
            @click="emit('open', item)"
            @keydown.enter="emit('open', item)"
          >
            <div class="flex items-center gap-2.5">
              <img
                v-if="item.icon && !brokenIcons.has(item.key)"
                :src="item.icon"
                class="size-8 shrink-0 rounded-lg border object-cover"
                loading="lazy"
                alt=""
                @error="iconFailed(item.key)"
              />
              <span
                v-else
                :class="[
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                  marketIconColor(item.name),
                ]"
              >
                {{ marketIconGlyph(item.name) }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="item.name">
                {{ item.name }}
              </span>
              <KeyRound
                v-if="item.requiresApiKey"
                class="size-3.5 shrink-0 text-muted-foreground"
                :title="t('market.requiresApiKey')"
              />
              <Button
                variant="outline"
                size="icon"
                class="size-7 shrink-0 rounded-lg"
                :title="t('market.install')"
                @click.stop="emit('open', item)"
              >
                <Plus class="size-3.5" />
              </Button>
            </div>
            <p class="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
              {{ item.description || item.sourceLabel }}
            </p>
            <div class="mt-2 flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
              <span
                class="flex items-center gap-1"
                :title="t('market.installs', { n: item.installs })"
              >
                <Download class="size-3.5" />
                {{ formatMarketCount(item.installs) }}
              </span>
              <span v-if="item.stars !== null" class="flex items-center gap-1" title="stars">
                <Star class="size-3.5" />
                {{ formatMarketCount(item.stars) }}
              </span>
            </div>
          </div>
        </li>
      </ul>

      <!-- infinite-scroll sentinel -->
      <div v-if="hasMore" ref="sentinel" class="pt-3">
        <ul v-if="loadingMore" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          <li v-for="i in 4" :key="i">
            <div class="flex h-full flex-col rounded-2xl border bg-card px-3.5 py-3.5">
              <div class="flex items-center gap-2.5">
                <Skeleton class="size-8 shrink-0 rounded-full" />
                <Skeleton class="h-4 flex-1" />
                <Skeleton class="size-7 shrink-0 rounded-lg" />
              </div>
              <Skeleton class="mt-3 h-3 w-full" />
              <Skeleton class="mt-1.5 h-3 w-3/4" />
              <div class="mt-3 flex gap-3">
                <Skeleton class="h-3 w-10" />
                <Skeleton class="h-3 w-10" />
              </div>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
