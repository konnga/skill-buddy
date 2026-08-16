<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  SwitchRoot,
  SwitchThumb,
} from 'reka-ui'
import { ArrowLeft, X } from '@lucide/vue'
import type { InstallTarget } from '../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import PlatformIcon from '@/components/PlatformIcon.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; advanced: [] }>()

const { detectedPlatforms, skills, installSkill, refresh } = useSkills()
const { importSyncPairs } = useSettings()
const { t } = useI18n()

const step = ref<1 | 2>(1)
/** enabled source app ids */
const enabled = ref<Set<string>>(new Set())
const keepSync = ref(true)

const targets = ref<InstallTarget[]>([])
const busy = ref(false)
const message = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      step.value = 1
      enabled.value = new Set(detectedPlatforms.value.map((p) => p.id))
      keepSync.value = true
      targets.value = []
      message.value = null
    }
  },
)

function toggleSource(id: string, on: boolean): void {
  const next = new Set(enabled.value)
  if (on) next.add(id)
  else next.delete(id)
  enabled.value = next
}

const sources = computed(() => [...enabled.value])

async function runImport(): Promise<void> {
  if (targets.value.length === 0) return
  busy.value = true
  message.value = null
  try {
    const installTargets = targets.value.filter(
      (target) => !(target.scope === 'user' && sources.value.includes(target.agent)),
    )
    let imported = 0
    for (const s of skills.value) {
      const sourceInst = s.installations.find(
        (i) => sources.value.includes(i.agent) && i.scope === 'user',
      )
      if (!sourceInst) continue
      const need = installTargets.filter(
        (tg) =>
          !s.installations.some(
            (i) =>
              i.agent === tg.agent &&
              i.scope === tg.scope &&
              (i.projectRoot ?? '') === (tg.projectRoot ?? ''),
          ),
      )
      if (need.length === 0) continue
      await installSkill(sourceInst.skill, need)
      imported++
    }
    await refresh()
    if (keepSync.value) {
      const sourceNames = (src: string): string[] =>
        skills.value
          .filter((s) => s.installations.some((i) => i.agent === src && i.scope === 'user'))
          .map((s) => s.name)
      for (const src of sources.value) {
        for (const tg of installTargets) {
          if (tg.agent === src && tg.scope === 'user') continue
          const exists = importSyncPairs.value.some(
            (pr) =>
              pr.source === src &&
              pr.target === tg.agent &&
              pr.scope === tg.scope &&
              (pr.projectRoot ?? '') === (tg.projectRoot ?? ''),
          )
          if (!exists) {
            importSyncPairs.value = [
              ...importSyncPairs.value,
              {
                source: src,
                target: tg.agent,
                scope: tg.scope,
                projectRoot: tg.projectRoot,
                synced: sourceNames(src),
              },
            ]
          }
        }
      }
    }
    message.value = imported > 0 ? t('importApps.done', { n: imported }) : t('importApps.none')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(o) => !o && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(760px,85vh)] w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-background outline-none"
        @open-auto-focus.prevent
      >
        <header class="flex shrink-0 items-center justify-between px-7 pt-6">
          <DialogTitle class="text-2xl font-bold tracking-tight">
            {{ t('importApps.title') }}
          </DialogTitle>
          <Button variant="ghost" size="icon" @click="emit('close')"><X /></Button>
        </header>

        <ScrollArea class="flex-1">
          <div class="px-7 py-5">
          <!-- step 1: sources -->
          <template v-if="step === 1">
            <p class="mb-3 text-sm text-muted-foreground">{{ t('importApps.found') }}</p>
            <div class="flex flex-col gap-3">
              <div
                v-for="p in detectedPlatforms"
                :key="p.id"
                class="flex items-center gap-4 rounded-2xl border px-5 py-4"
              >
                <span
                  class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted"
                >
                  <PlatformIcon :id="p.id" :size="24" />
                </span>
                <span class="min-w-0 flex-1 truncate text-base font-medium">
                  {{ p.displayName }}
                </span>
                <SwitchRoot
                  :model-value="enabled.has(p.id)"
                  class="h-[26px] w-[44px] shrink-0 rounded-full bg-input transition-colors data-[state=checked]:bg-sky-500"
                  @update:model-value="(v) => toggleSource(p.id, v)"
                >
                  <SwitchThumb
                    class="block size-[22px] translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[20px]"
                  />
                </SwitchRoot>
              </div>
            </div>

            <div class="mt-5 flex items-start justify-between gap-6">
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ t('importApps.keepSync') }}</p>
                <p class="mt-0.5 text-sm text-muted-foreground">
                  {{ t('importApps.keepSyncDesc') }}
                </p>
              </div>
              <input
                v-model="keepSync"
                type="checkbox"
                class="mt-1 size-4 shrink-0 accent-foreground"
              />
            </div>
          </template>

          <!-- step 2: targets -->
          <template v-else>
            <button
              class="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              @click="((step = 1), (message = null))"
            >
              <ArrowLeft class="size-4" />
              {{ t('importApps.back') }}
            </button>
            <PlatformTargetPicker v-model="targets" :label="t('importApps.targetsTitle')" />
            <p
              v-if="message"
              class="mt-4 text-sm"
              :class="message === t('importApps.none') ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'"
            >
              {{ message }}
            </p>
          </template>
          </div>
        </ScrollArea>

        <footer class="flex shrink-0 items-center gap-3 px-7 pb-6">
          <button
            class="text-sm text-muted-foreground underline-offset-2 hover:underline"
            @click="emit('advanced')"
          >
            {{ t('importApps.advanced') }}
          </button>
          <div class="flex-1" />
          <Button variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</Button>
          <Button v-if="step === 1" :disabled="enabled.size === 0" @click="step = 2">
            {{ t('importApps.continue') }}
          </Button>
          <Button v-else :disabled="busy || targets.length === 0" @click="runImport">
            {{ busy ? t('importApps.running') : t('importApps.run') }}
          </Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
