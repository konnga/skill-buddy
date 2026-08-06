<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload, Search } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
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

const expanded = ref<string | null>(null)
const scope = ref('user')
const agents = ref<string[]>([])
const busyKey = ref<string | null>(null)

/** skills.sh search requires >= 2 chars; use a broad default feed */
const DEFAULT_QUERY = 'ai'

async function search(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (source.value === 'skills-sh') {
      const term = query.value.trim() || DEFAULT_QUERY
      items.value = (await window.skillsManager.marketSearch(term)).slice(0, 30).map((s) => ({
        key: `sksh:${s.id}`,
        kind: 'skills-sh' as const,
        name: s.name,
        description: '',
        installs: s.installs,
        sourceLabel: s.source,
        link: `https://github.com/${s.source}`,
        repo: s.source,
        skillId: s.skillId,
      }))
    } else {
      const list = await window.skillsManager.skillhubSearch(query.value.trim())
      items.value = list.map((s) => ({
        key: `hub:${s.namespace}/${s.slug}`,
        kind: 'skillhub' as const,
        name: s.name,
        description: s.description,
        installs: s.installs,
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
  expanded.value = null
  void search()
})

function toggleExpand(key: string): void {
  expanded.value = expanded.value === key ? null : key
  agents.value = []
  scope.value = 'user'
  error.value = null
}

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
  error.value = null
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
      error.value = t('market.notFound')
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
      error.value = failed.map((f) => `${agentLabel(f.target.agent)}: ${f.error}`).join('；')
      return
    }
    expanded.value = null
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
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

    <ul v-else class="flex flex-col gap-2">
      <li v-for="item in items" :key="item.key" class="rounded-md border px-4 py-2.5">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="flex items-center gap-2 text-sm font-medium">
              <span class="select-text truncate">{{ item.name }}</span>
              <Badge variant="secondary" class="text-[10px]">
                {{ t('market.installs', { n: formatInstalls(item.installs) }) }}
              </Badge>
            </span>
            <span v-if="item.description" class="line-clamp-1 text-xs text-muted-foreground">
              {{ item.description }}
            </span>
            <button
              class="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
              :title="t('market.viewSource')"
              @click="openLink(item)"
            >
              {{ item.sourceLabel }}
            </button>
          </div>
          <Button variant="outline" size="sm" class="shrink-0" @click="toggleExpand(item.key)">
            <CloudDownload />
            {{ t('market.install') }}
          </Button>
        </div>
        <div v-if="expanded === item.key" class="mt-3 flex flex-col gap-2 border-t pt-3">
          <span class="text-xs text-muted-foreground">{{ t('team.installTo') }}</span>
          <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
          <Button
            size="sm"
            class="w-fit"
            :disabled="busyKey === item.key || agents.length === 0"
            @click="install(item)"
          >
            {{
              busyKey === item.key
                ? t('market.installing')
                : t('detail.installN', { n: agents.length })
            }}
          </Button>
        </div>
      </li>
    </ul>
  </section>
</template>
