<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  ExternalLink,
  KeyRound,
  Star,
} from '@lucide/vue'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import MarkdownIt from 'markdown-it'
import { Button } from '@/components/ui/button'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import {
  formatMarketCount,
  marketIconColor,
  marketIconGlyph,
  type MarketItem,
} from '@/lib/market'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ item: MarketItem; inset?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { installSkill, refresh } = useSkills()
const { t } = useI18n()

const scope = ref('user')
const iconBroken = ref(false)
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

/* ---------- overview (SKILL.md, best-effort) ---------- */

const md = new MarkdownIt({ linkify: true })
const overviewLoading = ref(true)
const matched = ref<FoundSkill | null>(null)
/** downloaded source root, kept alive so install() can reuse it */
const sourceRoot = ref<string | null>(null)

const overviewHtml = computed(() =>
  matched.value?.skill.content ? md.render(matched.value.skill.content) : null,
)

async function fetchSource(): Promise<{ root: string; items: FoundSkill[] }> {
  const item = props.item
  return item.kind === 'skills-sh'
    ? await window.skillsManager.importFromGit(`https://github.com/${item.repo}`)
    : await window.skillsManager.skillhubFetch(item.slug!, item.namespace ?? '')
}

function matchSkill(items: FoundSkill[]): FoundSkill | undefined {
  const item = props.item
  const wanted = item.kind === 'skills-sh' ? item.skillId! : item.slug!
  return (
    items.find((f) => f.skill.name === wanted) ??
    items.find((f) => f.dir.endsWith(`/${wanted}`)) ??
    (item.kind === 'skillhub' ? items[0] : undefined)
  )
}

onMounted(async () => {
  try {
    const result = await fetchSource()
    sourceRoot.value = result.root
    matched.value = matchSkill(result.items) ?? null
  } catch {
    // overview is best-effort; install() retries the download itself
  } finally {
    overviewLoading.value = false
  }
})

onUnmounted(() => {
  if (sourceRoot.value) void window.skillsManager.cleanupImport(sourceRoot.value)
})

/* ---------- meta ---------- */

function timeAgo(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000)
  if (min < 1) return t('dashboard.justNow')
  if (min < 60) return t('dashboard.minutesAgo', { n: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('dashboard.hoursAgo', { n: hours })
  return t('dashboard.daysAgo', { n: Math.floor(hours / 24) })
}

function openLink(): void {
  void window.skillsManager.openExternal(props.item.link)
}

/* ---------- install ---------- */

async function install(): Promise<void> {
  if (agents.value.length === 0) return
  busy.value = true
  error.value = null
  let tempRoot: string | null = null
  try {
    let found = matched.value
    if (!found) {
      const result = await fetchSource()
      tempRoot = result.root
      found = matchSkill(result.items) ?? null
    }
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
    await refresh()
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (tempRoot) await window.skillsManager.cleanupImport(tempRoot)
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex items-center gap-3 border-b px-6 py-3', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft />
      </Button>
      <h1 class="select-text min-w-0 truncate text-base font-semibold tracking-tight">
        {{ item.name }}
      </h1>
      <div class="flex-1" />
      <Button variant="outline" size="sm" class="app-no-drag" @click="openLink">
        <ExternalLink class="size-3.5" />
        {{ t('market.viewSource') }}
      </Button>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <!-- hero -->
        <div class="flex items-start gap-5">
          <img
            v-if="item.icon && !iconBroken"
            :src="item.icon"
            class="size-16 shrink-0 rounded-2xl border object-cover"
            alt=""
            @error="iconBroken = true"
          />
          <span
            v-else
            :class="[
              'flex size-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white',
              marketIconColor(item.name),
            ]"
          >
            {{ marketIconGlyph(item.name) }}
          </span>
          <div class="flex min-w-0 flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <h2 class="select-text min-w-0 truncate text-2xl font-bold tracking-tight">
                {{ item.name }}
              </h2>
              <BadgeCheck
                v-if="item.verified"
                class="size-5 shrink-0 text-sky-500"
                :title="t('market.verified')"
              />
            </div>
            <button
              class="select-text w-fit max-w-full truncate text-left text-sm text-muted-foreground underline-offset-2 hover:underline"
              :title="t('market.viewSource')"
              @click="openLink"
            >
              {{ item.sourceLabel.startsWith('@') ? item.sourceLabel : `@${item.sourceLabel}` }}
            </button>
            <div class="flex items-center gap-4 text-sm tabular-nums text-muted-foreground">
              <span
                class="flex items-center gap-1.5"
                :title="t('market.installs', { n: item.installs })"
              >
                <Download class="size-4" />
                {{ formatMarketCount(item.installs) }}
              </span>
              <span v-if="item.stars !== null" class="flex items-center gap-1.5" title="stars">
                <Star class="size-4" />
                {{ formatMarketCount(item.stars) }}
              </span>
            </div>
          </div>
        </div>

        <!-- description -->
        <p class="select-text text-sm leading-relaxed text-foreground/85">
          {{ item.description || t('card.noDescription') }}
        </p>

        <!-- meta chips -->
        <div
          v-if="item.requiresApiKey || (item.tags?.length ?? 0) > 0 || item.updatedAt || item.version"
          class="flex flex-wrap items-center gap-2"
        >
          <span
            v-if="item.requiresApiKey"
            class="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <KeyRound class="size-3" />
            {{ t('market.requiresApiKey') }}
          </span>
          <span
            v-for="tag in item.tags ?? []"
            :key="tag"
            class="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {{ tag }}
          </span>
          <span
            v-if="item.updatedAt"
            class="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {{ t('market.updated', { t: timeAgo(item.updatedAt) }) }}
          </span>
          <span
            v-if="item.version"
            class="rounded-full border px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground"
          >
            v{{ item.version }}
          </span>
        </div>

        <!-- install -->
        <section class="flex flex-col gap-2 rounded-xl border bg-muted/20 px-5 py-4">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('team.installTo') }}
          </h3>
          <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
          <p v-if="error" class="break-all text-xs text-destructive">{{ error }}</p>
          <Button
            class="mt-1 w-fit"
            :disabled="busy || agents.length === 0"
            @click="install"
          >
            {{ busy ? t('market.installing') : t('detail.installN', { n: agents.length }) }}
          </Button>
        </section>

        <!-- overview (SKILL.md) -->
        <section class="flex flex-col gap-3 border-t pt-6">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('market.overview') }}
          </h3>
          <p v-if="overviewLoading" class="py-8 text-center text-sm text-muted-foreground">
            {{ t('market.overviewLoading') }}
          </p>
          <article
            v-else-if="overviewHtml"
            class="markdown-body select-text text-sm leading-relaxed"
            v-html="overviewHtml"
          />
          <p v-else class="py-8 text-center text-sm text-muted-foreground">
            {{ t('market.overviewUnavailable') }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  margin: 1.25em 0 0.5em;
}
.markdown-body :deep(h1) {
  font-size: 1.25rem;
}
.markdown-body :deep(h2) {
  font-size: 1.1rem;
}
.markdown-body :deep(h3) {
  font-size: 1rem;
}
.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.4em;
}
.markdown-body :deep(ul) {
  list-style: disc;
}
.markdown-body :deep(ol) {
  list-style: decimal;
}
.markdown-body :deep(code) {
  background: hsl(var(--muted) / 0.6);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.85em;
}
.markdown-body :deep(pre) {
  background: hsl(var(--muted) / 0.5);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.75em 0;
}
.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.75em 0;
  width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.4em 0.7em;
  text-align: left;
}
.markdown-body :deep(th) {
  background: hsl(var(--muted) / 0.4);
  font-weight: 600;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid hsl(var(--border));
  padding-left: 1em;
  color: hsl(var(--muted-foreground));
  margin: 0.75em 0;
}
.markdown-body :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
