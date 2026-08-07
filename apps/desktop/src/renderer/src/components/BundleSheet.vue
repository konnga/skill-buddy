<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { bundleText, matchFoundSkill, type BundleSkillRef, type SkillBundle } from '@/lib/bundles'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ open: boolean; bundle: SkillBundle | null }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const { skills, refresh } = useSkills()
const { groups } = useSettings()

const selected = ref<Set<string>>(new Set())
const scope = ref('user')
const agents = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const note = ref<string | null>(null)
const progress = ref<{ n: number; total: number } | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    selected.value = new Set(props.bundle?.skills.map((s) => s.name) ?? [])
    scope.value = 'user'
    agents.value = []
    error.value = null
    note.value = null
    progress.value = null
  },
)

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
  if (!bundle || busy.value) return
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
            const results = await window.skillsManager.installSkill(
              local.installations[0]!.skill,
              need,
            )
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
        const results = await window.skillsManager.installSkill(found.skill, targets)
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
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-[92vw] flex-col border-l bg-background outline-none"
        @open-auto-focus.prevent
      >
        <header class="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle class="text-base font-semibold tracking-tight">
            {{ bundle ? bundleText(bundle.name, locale) : '' }}
          </DialogTitle>
          <Button variant="ghost" size="icon" @click="emit('close')"><X /></Button>
        </header>

        <div v-if="bundle" class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <p class="text-sm text-muted-foreground">{{ bundleText(bundle.description, locale) }}</p>

          <div class="flex flex-col gap-2">
            <label
              v-for="s in bundle.skills"
              :key="s.name"
              class="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5"
            >
              <input
                type="checkbox"
                class="mt-0.5 accent-foreground"
                :checked="selected.has(s.name)"
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
            </label>
          </div>

          <span class="text-xs text-muted-foreground">{{ t('team.installTo') }}</span>
          <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />

          <p v-if="note" class="text-xs text-amber-600 dark:text-amber-400">{{ note }}</p>
          <p v-if="error" class="break-all text-xs text-destructive">{{ error }}</p>
        </div>

        <footer class="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button variant="ghost" size="sm" :disabled="busy" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            :disabled="busy || selected.size === 0 || agents.length === 0"
            @click="install"
          >
            {{
              busy && progress
                ? t('bundles.installing', { n: progress.n, total: progress.total })
                : t('bundles.install', { n: selected.size })
            }}
          </Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
