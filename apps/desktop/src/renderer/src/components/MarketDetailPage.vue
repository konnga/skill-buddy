<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Download, ExternalLink, Star } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
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
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

function openLink(): void {
  void window.skillsManager.openExternal(props.item.link)
}

async function install(): Promise<void> {
  if (agents.value.length === 0) return
  busy.value = true
  error.value = null
  let cloneRoot: string | null = null
  try {
    const item = props.item
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
    await refresh()
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (cloneRoot) await window.skillsManager.cleanupImport(cloneRoot)
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag flex items-center gap-3 border-b px-6 py-3', props.inset && 'pl-36']">
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft />
      </Button>
      <span
        :class="[
          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
          marketIconColor(item.name),
        ]"
      >
        {{ marketIconGlyph(item.name) }}
      </span>
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
      <div class="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
        <!-- source + stats -->
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <button
            class="flex min-w-0 items-center gap-1 truncate underline-offset-2 hover:underline"
            :title="t('market.viewSource')"
            @click="openLink"
          >
            <span class="truncate">{{ item.sourceLabel }}</span>
          </button>
          <span
            class="flex shrink-0 items-center gap-1.5 tabular-nums"
            :title="t('market.installs', { n: item.installs })"
          >
            <Download class="size-4" />
            {{ formatMarketCount(item.installs) }}
          </span>
          <span
            v-if="item.stars !== null"
            class="flex shrink-0 items-center gap-1.5 tabular-nums"
            title="stars"
          >
            <Star class="size-4" />
            {{ formatMarketCount(item.stars) }}
          </span>
        </div>

        <!-- description -->
        <p class="select-text text-sm leading-relaxed text-foreground/85">
          {{ item.description || t('card.noDescription') }}
        </p>

        <!-- install -->
        <section class="flex flex-col gap-2 border-t pt-5">
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
      </div>
    </div>
  </div>
</template>
