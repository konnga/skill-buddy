<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Plus, Search, Star } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
const error = ref<string | null>(null)

/** skills.sh search requires >= 2 chars; use a broad default feed */
const DEFAULT_QUERY = 'ai'

async function search(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (source.value === 'skills-sh') {
      const term = query.value.trim() || DEFAULT_QUERY
      const list = (await window.skillsManager.marketSearch(term)).slice(0, 30)
      items.value = list.map((s) => ({
        key: `sksh:${s.id}`,
        kind: 'skills-sh' as const,
        name: s.name,
        description: '',
        installs: s.installs,
        stars: null,
        sourceLabel: s.source,
        link: `https://github.com/${s.source}`,
        repo: s.source,
        skillId: s.skillId,
      }))
      // fill GitHub stars asynchronously (cached in main; degrades on rate limit)
      void window.skillsManager
        .githubStars([...new Set(list.map((s) => s.source))])
        .then((stars) => {
          items.value = items.value.map((it) =>
            it.kind === 'skills-sh' && it.repo && stars[it.repo] !== undefined
              ? { ...it, stars: stars[it.repo]! }
              : it,
          )
        })
    } else {
      const list = await window.skillsManager.skillhubSearch(query.value.trim())
      items.value = list.map((s) => ({
        key: `hub:${s.namespace}/${s.slug}`,
        kind: 'skillhub' as const,
        name: s.name,
        description: s.description,
        installs: s.installs,
        stars: s.stars,
        sourceLabel: s.canonicalName,
        link: s.upstreamUrl ?? 'https://skillhub.cn/',
        slug: s.slug,
        namespace: s.namespace,
      }))
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(source, () => void search())

onMounted(() => void search())
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

    <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">…</div>
    <p v-else-if="items.length === 0" class="py-10 text-center text-sm text-muted-foreground">
      {{ t('market.empty') }}
    </p>

    <ul v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <li v-for="item in items" :key="item.key">
        <div
          class="group flex h-full cursor-pointer flex-col rounded-2xl border bg-card px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          role="button"
          tabindex="0"
          @click="emit('open', item)"
          @keydown.enter="emit('open', item)"
        >
          <div class="flex items-center gap-3">
            <span
              :class="[
                'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                marketIconColor(item.name),
              ]"
            >
              {{ marketIconGlyph(item.name) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="item.name">
              {{ item.name }}
            </span>
            <Button
              variant="outline"
              size="icon"
              class="size-8 shrink-0 rounded-lg"
              :title="t('market.install')"
              @click.stop="emit('open', item)"
            >
              <Plus class="size-4" />
            </Button>
          </div>
          <p class="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
            {{ item.description || item.sourceLabel }}
          </p>
          <div class="mt-2 flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
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
  </section>
</template>
