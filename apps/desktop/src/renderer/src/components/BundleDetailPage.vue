<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ChevronRight, Sparkles } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
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

const props = defineProps<{ bundle: SkillBundle; inset?: boolean }>()
const emit = defineEmits<{ close: []; openSkill: [item: MarketItem] }>()

const { t, locale } = useI18n()
const { skills, detectedPlatforms, installSkill, refresh: refreshSkills } = useSkills()
const { groups } = useSettings()

const selectedSkills = ref(new Set(props.bundle.skills.map((skill) => skill.name)))
const targets = ref<InstallTarget[]>([])
const busy = shallowRef(false)
const error = shallowRef<string | null>(null)
const note = shallowRef<string | null>(null)
const progress = ref<{ n: number; total: number } | null>(null)

const selectedCount = computed(() => selectedSkills.value.size)
const installDisabled = computed(
  () => busy.value || selectedCount.value === 0 || targets.value.length === 0,
)

onMounted(() => {
  targets.value = detectedPlatforms.value.map((platform) => ({
    agent: platform.id,
    scope: 'user',
  }))
})

function toggleSkill(name: string): void {
  if (busy.value) return
  const next = new Set(selectedSkills.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selectedSkills.value = next
}

const isLocalSkill = (name: string): boolean => skills.value.some((skill) => skill.name === name)

const refSourceLabel = (ref: BundleSkillRef): string =>
  ref.source === 'skills-sh' ? ref.repo : `SkillHub · ${ref.namespace}/${ref.slug}`

async function installSelectedSkills(chosen: BundleSkillRef[]): Promise<boolean> {
  const failures: string[] = []
  const installedNames: string[] = []
  const roots: string[] = []
  const fetchCache = new Map<
    string,
    Awaited<ReturnType<typeof window.skillsManager.importFromGit>>
  >()

  try {
    for (const [index, skillRef] of chosen.entries()) {
      progress.value = { n: index + 1, total: chosen.length }
      try {
        const local = skills.value.find((skill) => skill.name === skillRef.name)
        if (local) {
          const missingTargets = targets.value.filter(
            (target) =>
              !local.installations.some(
                (installation) =>
                  installation.agent === target.agent &&
                  installation.scope === target.scope &&
                  (installation.projectRoot ?? '') === (target.projectRoot ?? ''),
              ),
          )
          if (missingTargets.length > 0) {
            const results = await installSkill(local.installations[0]!.skill, missingTargets, {
              refresh: false,
            })
            failures.push(
              ...results
                .filter((result) => !result.ok)
                .map(
                  (result) =>
                    `${skillRef.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
                ),
            )
          }
          installedNames.push(skillRef.name)
          continue
        }

        let fetched: {
          root: string
          items: Awaited<ReturnType<typeof window.skillsManager.findSkillsInDir>>
        }
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
        const results = await installSkill(found.skill, targets.value, { refresh: false })
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map(
              (result) =>
                `${skillRef.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
            ),
        )
        if (results.some((result) => result.ok)) installedNames.push(skillRef.name)
      } catch (cause) {
        failures.push(`${skillRef.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  } finally {
    await Promise.allSettled(roots.map((root) => window.skillsManager.cleanupImport(root)))
    progress.value = null
  }

  const groupName = bundleText(props.bundle.name, locale.value)
  if (installedNames.length > 0) {
    const existing = groups.value.find((group) => group.name === groupName)
    groups.value = existing
      ? groups.value.map((group) =>
          group.name === groupName
            ? { ...group, skills: [...new Set([...group.skills, ...installedNames])] }
            : group,
        )
      : [...groups.value, { name: groupName, skills: installedNames }]
  }
  await refreshSkills()

  if (failures.length === 0) return true
  error.value = failures.join('；')
  if (installedNames.length > 0) {
    note.value = t('bundles.partial', { n: installedNames.length, group: groupName })
  }
  return false
}

async function beginInstall(): Promise<void> {
  if (installDisabled.value) return
  error.value = null
  note.value = null
  busy.value = true
  const chosen = props.bundle.skills.filter((skill) => selectedSkills.value.has(skill.name))
  const success = await installSelectedSkills(chosen)
  busy.value = false
  if (success) {
    showToast({
      message: t('bundles.installSuccess', {
        name: bundleText(props.bundle.name, locale.value),
      }),
    })
    emit('close')
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="text-base font-semibold leading-5 tracking-tight">
        {{ bundleText(bundle.name, locale) }}
      </h1>
      <div class="flex-1" />
      <Button
        size="sm"
        class="app-no-drag"
        :disabled="installDisabled"
        @click="beginInstall"
      >
        <template v-if="busy && progress">
          {{ t('bundles.installing', { n: progress.n, total: progress.total }) }}
        </template>
        <template v-else>{{ t('bundles.install', { n: selectedCount }) }}</template>
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        <div
          class="flex items-start gap-4 rounded-lg border bg-card px-5 py-5"
          :style="{ backgroundImage: bundleGradient(bundle.id) }"
        >
          <span
            :class="[
              'flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-white',
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
            <span class="text-sm text-muted-foreground">
              {{ t('bundles.skillCount', { n: bundle.skills.length }) }}
            </span>
          </div>
        </div>

        <section v-if="bundle.skills.length" class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Sparkles class="size-4 text-muted-foreground" />
            <h3 class="text-sm font-semibold">{{ t('bundles.skillsSection') }}</h3>
            <Badge variant="secondary">{{ bundle.skills.length }}</Badge>
          </div>
          <div class="flex flex-col gap-2">
            <div
              v-for="skill in bundle.skills"
              :key="skill.name"
              :class="[
                'flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
                busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-foreground/25',
              ]"
              role="button"
              tabindex="0"
              @click="!busy && emit('openSkill', bundleRefToMarketItem(skill))"
              @keydown.enter="!busy && emit('openSkill', bundleRefToMarketItem(skill))"
            >
              <input
                type="checkbox"
                class="size-4 accent-foreground"
                :checked="selectedSkills.has(skill.name)"
                :disabled="busy"
                @click.stop
                @change="toggleSkill(skill.name)"
              />
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {{ skill.name }}
                  <Badge v-if="isLocalSkill(skill.name)" variant="success">
                    {{ t('bundles.installedBadge') }}
                  </Badge>
                </span>
                <span class="line-clamp-1 text-sm text-muted-foreground">
                  {{ refSourceLabel(skill) }}
                </span>
              </span>
              <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
            </div>
          </div>
          <PlatformTargetPicker v-model="targets" :label="t('bundles.skillTargets')" />
        </section>

        <div v-if="note || error" class="flex flex-col gap-2 border-t pt-4">
          <p v-if="note" class="text-sm text-amber-600 dark:text-amber-400">{{ note }}</p>
          <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
        </div>
      </div>
    </ScrollArea>

  </div>
</template>
