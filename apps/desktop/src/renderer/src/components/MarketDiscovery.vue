<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload, ExternalLink, Search } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

interface MarketSkill {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

const { installSkill, refresh } = useSkills()
const { t } = useI18n()

const source = ref<'skills-sh' | 'skillhub'>('skills-sh')
const query = ref('')
const items = ref<MarketSkill[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const expanded = ref<string | null>(null)
const scope = ref('user')
const agents = ref<string[]>([])
const busyId = ref<string | null>(null)

/** default feed: a broad query, sorted by installs (API requires >= 2 chars) */
const DEFAULT_QUERY = 'ai'

async function search(q?: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const term = (q ?? query.value).trim() || DEFAULT_QUERY
    items.value = (await window.skillsManager.marketSearch(term)).slice(0, 30)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function toggleExpand(id: string): void {
  expanded.value = expanded.value === id ? null : id
  agents.value = []
  scope.value = 'user'
  error.value = null
}

function openRepo(item: MarketSkill): void {
  void window.skillsManager.openExternal(`https://github.com/${item.source}`)
}

function openSkillhub(): void {
  void window.skillsManager.openExternal('https://skillhub.cn/')
}

function formatInstalls(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

async function install(item: MarketSkill): Promise<void> {
  if (agents.value.length === 0) return
  busyId.value = item.id
  error.value = null
  let cloneRoot: string | null = null
  try {
    const result = await window.skillsManager.importFromGit(
      `https://github.com/${item.source}`,
    )
    cloneRoot = result.root
    const found =
      result.items.find((f) => f.skill.name === item.skillId) ??
      result.items.find((f) => f.dir.endsWith(`/${item.skillId}`))
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
    busyId.value = null
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

    <!-- skillhub: no public API yet -->
    <div
      v-if="source === 'skillhub'"
      class="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-10 text-center"
    >
      <p class="max-w-md text-sm text-muted-foreground">{{ t('market.skillhubHint') }}</p>
      <Button
        variant="outline"
        size="sm"
        @click="openSkillhub"
      >
        <ExternalLink />
        {{ t('market.openSite', { site: 'skillhub.cn' }) }}
      </Button>
    </div>

    <template v-else>
      <div class="relative mb-3">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="query"
          :placeholder="t('market.searchPh')"
          class="pl-8"
          @keydown.enter="search()"
        />
      </div>

      <p v-if="error" class="mb-2 break-all text-xs text-destructive">{{ error }}</p>

      <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">…</div>
      <p
        v-else-if="items.length === 0"
        class="py-10 text-center text-sm text-muted-foreground"
      >
        {{ t('market.empty') }}
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="item in items" :key="item.id" class="rounded-md border px-4 py-2.5">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="flex items-center gap-2 text-sm font-medium">
                <span class="select-text truncate">{{ item.name }}</span>
                <Badge variant="secondary" class="text-[10px]">
                  {{ t('market.installs', { n: formatInstalls(item.installs) }) }}
                </Badge>
              </span>
              <button
                class="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
                :title="t('market.viewSource')"
                @click="openRepo(item)"
              >
                {{ item.source }}
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="shrink-0"
              @click="toggleExpand(item.id)"
            >
              <CloudDownload />
              {{ t('market.install') }}
            </Button>
          </div>
          <div v-if="expanded === item.id" class="mt-3 flex flex-col gap-2 border-t pt-3">
            <span class="text-xs text-muted-foreground">{{ t('team.installTo') }}</span>
            <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
            <Button
              size="sm"
              class="w-fit"
              :disabled="busyId === item.id || agents.length === 0"
              @click="install(item)"
            >
              {{
                busyId === item.id
                  ? t('market.installing')
                  : t('detail.installN', { n: agents.length })
              }}
            </Button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>
