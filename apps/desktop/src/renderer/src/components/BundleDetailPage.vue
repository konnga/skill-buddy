<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { ArrowLeft, ChevronRight } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import {
  bundleGradient,
  bundleRefToMarketItem,
  bundleText,
  matchFoundSkill,
  type BundleSkillRef,
  type SkillBundle,
} from '@/lib/bundles'
import { marketIconColor, marketIconGlyph, type MarketItem } from '@/lib/market'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ bundle: SkillBundle; inset?: boolean }>()
const emit = defineEmits<{ close: []; openSkill: [item: MarketItem] }>()

const { t, locale } = useI18n()
const { skills, detectedPlatforms, installSkill, refresh } = useSkills()
const { groups } = useSettings()

const selected = ref<Set<string>>(new Set(props.bundle.skills.map((s) => s.name)))
const scope = ref('user')
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const note = ref<string | null>(null)
const progress = ref<{ n: number; total: number } | null>(null)

onMounted(() => {
  // create once, share everywhere: preselect every detected platform
  agents.value = detectedPlatforms.value.map((p) => p.id)
})

function toggle(name: string): void {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selected.value = next
}

const isLocal = (name: string): boolean => skills.value.some((s) => s.name === name)

const refSourceLabel = (r: BundleSkillRef): string =>
  r.source === 'skills-sh' ? r.repo : `SkillHub · ${r.namespace}/${r.slug}`

async function install(): Promise<void> {
  const bundle = props.bundle
  if (busy.value) return
  const chosen = bundle.skills.filter((s) => selected.value.has(s.name))
  if (chosen.length === 0 || agents.value.length === 0) return

  error.value = null
  note.value = null
  busy.value = true
  const targets: InstallTarget[] = agents.value.map((agent) =>
    scope.value === 'user'
      ? { agent, scope: 'user' }
      : { agent, scope: 'project', projectRoot: scope.value },
  )
  const failures: string[] = []
  const installedNames: string[] = []
  const roots: string[] = []
  const fetchCache = new Map<string, Awaited<ReturnType<typeof window.skillsManager.importFromGit>>>()

  try {
    for (const [i, skillRef] of chosen.entries()) {
      progress.value = { n: i + 1, total: chosen.length }
      try {
        const local = skills.value.find((s) => s.name === skillRef.name)
        if (local) {
          // Install the local copy to targets it's missing from — never
          // re-download over local edits (drift detection owns that story).
          const need = targets.filter(
            (tg) =>
              !local.installations.some(
                (inst) =>
                  inst.agent === tg.agent &&
                  inst.scope === tg.scope &&
                  (inst.projectRoot ?? '') === (tg.projectRoot ?? ''),
              ),
          )
          if (need.length > 0) {
            const results = await installSkill(local.installations[0]!.skill, need, {
              refresh: false,
            })
            failures.push(
              ...results
                .filter((r) => !r.ok)
                .map((r) => `${skillRef.name} → ${agentLabel(r.target.agent)}: ${r.error}`),
            )
          }
          installedNames.push(skillRef.name)
          continue
        }

        let fetched: { root: string; items: Awaited<ReturnType<typeof window.skillsManager.findSkillsInDir>> }
        if (skillRef.source === 'skills-sh') {
          const cached = fetchCache.get(skillRef.repo)
          if (cached) fetched = cached
          else {
            fetched = await window.skillsManager.importFromGit(
              `https://github.com/${skillRef.repo}`,
            )
            fetchCache.set(skillRef.repo, fetched)
            roots.push(fetched.root)
          }
        } else {
          fetched = await window.skillsManager.skillhubFetch(skillRef.slug, skillRef.namespace)
          roots.push(fetched.root)
        }

        const wanted = skillRef.source === 'skills-sh' ? skillRef.skillId : skillRef.slug
        const found = matchFoundSkill(fetched.items, wanted, skillRef.source)
        if (!found) {
          failures.push(`${skillRef.name}: ${t('market.notFound')}`)
          continue
        }
        const results = await installSkill(found.skill, targets, { refresh: false })
        failures.push(
          ...results
            .filter((r) => !r.ok)
            .map((r) => `${skillRef.name} → ${agentLabel(r.target.agent)}: ${r.error}`),
        )
        if (results.some((r) => r.ok)) installedNames.push(skillRef.name)
      } catch (e) {
        failures.push(`${skillRef.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } finally {
    // resources reference absolute paths under the temp roots — clean up
    // only after every install has copied them.
    await Promise.allSettled(roots.map((r) => window.skillsManager.cleanupImport(r)))
    busy.value = false
    progress.value = null
  }

  const groupName = bundleText(bundle.name, locale.value)
  if (installedNames.length > 0) {
    const existing = groups.value.find((g) => g.name === groupName)
    groups.value = existing
      ? groups.value.map((g) =>
          g.name === groupName
            ? { ...g, skills: [...new Set([...g.skills, ...installedNames])] }
            : g,
        )
      : [...groups.value, { name: groupName, skills: installedNames }]
  }
  await refresh()

  if (failures.length > 0) {
    error.value = failures.join('；')
    if (installedNames.length > 0) {
      note.value = t('bundles.partial', { n: installedNames.length, group: groupName })
    }
    return
  }
  emit('close')
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="text-base font-semibold leading-5 tracking-tight">{{ bundleText(bundle.name, locale) }}</h1>
      <div class="flex-1" />
      <Button
        size="sm"
        class="app-no-drag"
        :disabled="busy || selected.size === 0 || agents.length === 0"
        @click="install"
      >
        {{
          busy && progress
            ? t('bundles.installing', { n: progress.n, total: progress.total })
            : t('bundles.install', { n: selected.size })
        }}
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        <!-- hero -->
        <div
          class="flex items-start gap-4 rounded-2xl border bg-card px-5 py-5"
          :style="{ backgroundImage: bundleGradient(bundle.id) }"
        >
          <span
            :class="[
              'flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white',
              marketIconColor(bundle.id),
            ]"
          >
            {{ marketIconGlyph(bundleText(bundle.name, locale)) }}
          </span>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="text-xl font-bold tracking-tight">{{ bundleText(bundle.name, locale) }}</h2>
            <p class="text-sm text-muted-foreground">
              {{ bundleText(bundle.description, locale) }}
            </p>
            <span class="text-xs text-muted-foreground">
              {{ t('bundles.skillCount', { n: bundle.skills.length }) }}
            </span>
          </div>
        </div>

        <!-- members: checkbox selects, row opens the skill's detail page -->
        <div class="flex flex-col gap-2">
          <div
            v-for="s in bundle.skills"
            :key="s.name"
            class="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors hover:border-foreground/25"
            role="button"
            tabindex="0"
            @click="emit('openSkill', bundleRefToMarketItem(s))"
            @keydown.enter="emit('openSkill', bundleRefToMarketItem(s))"
          >
            <input
              type="checkbox"
              class="accent-foreground"
              :checked="selected.has(s.name)"
              @click.stop
              @change="toggle(s.name)"
            />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex items-center gap-2 text-sm font-medium">
                {{ s.name }}
                <Badge v-if="isLocal(s.name)" variant="success">
                  {{ t('bundles.installedBadge') }}
                </Badge>
              </span>
              <span class="line-clamp-1 text-xs text-muted-foreground">
                {{ refSourceLabel(s) }}
              </span>
            </span>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
          </div>
        </div>

        <!-- install targets -->
        <section class="flex flex-col gap-2 rounded-xl border bg-muted/20 px-5 py-4">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('team.installTo') }}
          </h3>
          <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
          <p v-if="note" class="text-xs text-amber-600 dark:text-amber-400">{{ note }}</p>
          <p v-if="error" class="break-all text-xs text-destructive">{{ error }}</p>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
