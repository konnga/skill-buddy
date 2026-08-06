<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { Download, ExternalLink, Plus, Search, Star, X } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

type SourceId = 'skills-sh' | 'skillhub'

interface MarketItem {
  key: string
  kind: SourceId
  name: string
  description: string
  installs: number
  stars: number | null
  /** repo (skills.sh) or canonical name (skillhub) — shown under the title */
  sourceLabel: string
  /** external page to open */
  link: string
  /** skills.sh: repo + skill id */
  repo?: string
  skillId?: string
  /** skillhub: slug + namespace */
  slug?: string
  namespace?: string
}

const { installSkill, refresh } = useSkills()
const { t } = useI18n()

const source = ref<SourceId>('skills-sh')
const query = ref('')
const items = ref<MarketItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const detail = ref<MarketItem | null>(null)
const scope = ref('user')
const agents = ref<string[]>([])
const busyKey = ref<string | null>(null)
const installError = ref<string | null>(null)

/** skills.sh search requires >= 2 chars; use a broad default feed */
const DEFAULT_QUERY = 'ai'

/** deterministic icon color per skill name */
const ICON_COLORS = [
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-fuchsia-500',
  'bg-lime-600',
]

function iconColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ICON_COLORS[h % ICON_COLORS.length]!
}

function iconGlyph(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

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

watch(source, () => {
  detail.value = null
  void search()
})

function openDetail(item: MarketItem): void {
  detail.value = item
  agents.value = []
  scope.value = 'user'
  installError.value = null
}

/** keep stats in the open sheet fresh when stars land asynchronously */
const detailItem = computed(
  () => items.value.find((it) => it.key === detail.value?.key) ?? detail.value,
)

function openLink(item: MarketItem): void {
  void window.skillsManager.openExternal(item.link)
}

function formatInstalls(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

async function install(item: MarketItem): Promise<void> {
  if (agents.value.length === 0) return
  busyKey.value = item.key
  installError.value = null
  let cloneRoot: string | null = null
  try {
    const result =
      item.kind === 'skills-sh'
        ? await window.skillsManager.importFromGit(`https://github.com/${item.repo}`)
        : await window.skillsManager.skillhubFetch(item.slug!, item.namespace ?? '')
    cloneRoot = result.root
    const wanted = item.kind === 'skills-sh' ? item.skillId! : item.slug!
    const found =
      result.items.find((f) => f.skill.name === wanted) ??
      result.items.find((f) => f.dir.endsWith(`/${wanted}`)) ??
      (item.kind === 'skillhub' ? result.items[0] : undefined)
    if (!found) {
      installError.value = t('market.notFound')
      return
    }
    const targets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const results = await installSkill(found.skill, targets)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      installError.value = failed
        .map((f) => `${agentLabel(f.target.agent)}: ${f.error}`)
        .join('；')
      return
    }
    detail.value = null
    await refresh()
  } catch (e) {
    installError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (cloneRoot) await window.skillsManager.cleanupImport(cloneRoot)
    busyKey.value = null
  }
}

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
          @click="openDetail(item)"
          @keydown.enter="openDetail(item)"
        >
          <div class="flex items-center gap-3">
            <span
              :class="[
                'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                iconColor(item.name),
              ]"
            >
              {{ iconGlyph(item.name) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="item.name">
              {{ item.name }}
            </span>
            <Button
              variant="outline"
              size="icon"
              class="size-8 shrink-0 rounded-lg"
              :title="t('market.install')"
              @click.stop="openDetail(item)"
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
              {{ formatInstalls(item.installs) }}
            </span>
            <span v-if="item.stars !== null" class="flex items-center gap-1" title="stars">
              <Star class="size-3.5" />
              {{ formatInstalls(item.stars) }}
            </span>
          </div>
        </div>
      </li>
    </ul>

    <!-- detail sheet -->
    <DialogRoot :open="detail !== null" @update:open="(v) => !v && (detail = null)">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <DialogContent
          class="fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-[92vw] flex-col border-l bg-background outline-none"
          @open-auto-focus.prevent
        >
          <template v-if="detailItem">
            <header class="flex items-center gap-3 border-b px-6 py-4">
              <span
                :class="[
                  'flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white',
                  iconColor(detailItem.name),
                ]"
              >
                {{ iconGlyph(detailItem.name) }}
              </span>
              <div class="min-w-0 flex-1">
                <DialogTitle
                  class="truncate text-base font-semibold tracking-tight"
                  :title="detailItem.name"
                >
                  {{ detailItem.name }}
                </DialogTitle>
                <button
                  class="flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                  :title="t('market.viewSource')"
                  @click="openLink(detailItem)"
                >
                  <span class="truncate">{{ detailItem.sourceLabel }}</span>
                  <ExternalLink class="size-3 shrink-0" />
                </button>
              </div>
              <Button variant="ghost" size="icon" class="shrink-0" @click="detail = null">
                <X />
              </Button>
            </header>

            <div class="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <div class="flex items-center gap-5 text-sm tabular-nums text-muted-foreground">
                <span
                  class="flex items-center gap-1.5"
                  :title="t('market.installs', { n: detailItem.installs })"
                >
                  <Download class="size-4" />
                  {{ formatInstalls(detailItem.installs) }}
                </span>
                <span v-if="detailItem.stars !== null" class="flex items-center gap-1.5" title="stars">
                  <Star class="size-4" />
                  {{ formatInstalls(detailItem.stars) }}
                </span>
              </div>

              <p class="text-sm leading-relaxed text-foreground/85">
                {{ detailItem.description || t('card.noDescription') }}
              </p>

              <div class="flex flex-col gap-2 border-t pt-4">
                <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {{ t('team.installTo') }}
                </span>
                <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
                <p v-if="installError" class="break-all text-xs text-destructive">
                  {{ installError }}
                </p>
                <Button
                  class="mt-1 w-fit"
                  :disabled="busyKey === detailItem.key || agents.length === 0"
                  @click="install(detailItem)"
                >
                  {{
                    busyKey === detailItem.key
                      ? t('market.installing')
                      : t('detail.installN', { n: agents.length })
                  }}
                </Button>
              </div>
            </div>
          </template>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>
