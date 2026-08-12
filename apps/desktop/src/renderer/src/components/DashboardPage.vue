<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Blocks, ChevronRight, FolderGit2, MonitorCheck, TriangleAlert } from '@lucide/vue'
import { Card } from '@/components/ui/card'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import MarketDiscovery from '@/components/MarketDiscovery.vue'
import OfficialBundles from '@/components/OfficialBundles.vue'
import type { SkillBundle } from '@/lib/bundles'
import type { MarketItem } from '@/lib/market'

const emit = defineEmits<{
  openMarket: [item: MarketItem]
  openBundles: []
  openBundle: [bundle: SkillBundle]
  openDrift: []
}>()

const { skills, detectedPlatforms } = useSkills()
const { projectRoots } = useSettings()
const { t } = useI18n()

const driftSkills = computed(() => skills.value.filter((s) => s.hasDrift))

const stats = computed(() => [
  {
    icon: Blocks,
    label: t('dashboard.totalSkills'),
    desc: t('dashboard.totalSkillsDesc'),
    value: skills.value.length,
    tone: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  },
  {
    icon: MonitorCheck,
    label: t('dashboard.platformsDetected'),
    desc: t('dashboard.platformsDetectedDesc'),
    value: detectedPlatforms.value.length,
    tone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: TriangleAlert,
    label: t('dashboard.driftCount'),
    desc: t('dashboard.driftCountDesc'),
    value: driftSkills.value.length,
    tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    warn: driftSkills.value.length > 0,
    action: 'drift' as const,
  },
  {
    icon: FolderGit2,
    label: t('dashboard.projectDirs'),
    desc: t('dashboard.projectDirsDesc'),
    value: projectRoots.value.length,
    tone: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  },
])

const driftCardListeners = { click: () => emit('openDrift') }
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
    <!-- stats -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card
        v-for="stat in stats"
        :key="stat.label"
        :class="[
          stat.action === 'drift' &&
            'group transition-[border-color,box-shadow] duration-150 hover:border-amber-500/45 hover:shadow-sm focus-within:border-amber-500/45 focus-within:ring-2 focus-within:ring-amber-500/20',
        ]"
      >
        <component
          :is="stat.action === 'drift' ? 'button' : 'div'"
          :type="stat.action === 'drift' ? 'button' : undefined"
          :class="[
            'flex w-full flex-col gap-2 rounded-lg p-4 text-left outline-none',
            stat.action === 'drift' && 'cursor-pointer',
          ]"
          v-on="stat.action === 'drift' ? driftCardListeners : {}"
        >
          <span class="flex items-center gap-2.5">
            <span
              :class="[
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                stat.tone,
              ]"
            >
              <component :is="stat.icon" class="size-4" />
            </span>
            <span class="text-sm font-semibold">{{ stat.label }}</span>
            <ChevronRight
              v-if="stat.action === 'drift'"
              class="ml-auto size-4 text-muted-foreground transition-colors group-hover:text-amber-600 group-focus-within:text-amber-600 dark:group-hover:text-amber-400 dark:group-focus-within:text-amber-400"
            />
          </span>
          <span
            :class="[
              'text-3xl font-bold tabular-nums tracking-tight',
              stat.warn && 'text-amber-600 dark:text-amber-400',
            ]"
          >
            {{ stat.value }}
          </span>
          <span class="text-sm text-muted-foreground">{{ stat.desc }}</span>
        </component>
      </Card>
    </div>

    <!-- skill packages -->
    <OfficialBundles @use="emit('openBundle', $event)" @more="emit('openBundles')" />

    <!-- marketplace discovery -->
    <MarketDiscovery @open="emit('openMarket', $event)" />
  </div>
</template>
