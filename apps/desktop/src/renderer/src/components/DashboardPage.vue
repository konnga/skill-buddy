<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Blocks, FolderGit2, MonitorCheck, TriangleAlert } from '@lucide/vue'
import { Card, CardContent } from '@/components/ui/card'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import BundleSheet from '@/components/BundleSheet.vue'
import MarketDiscovery from '@/components/MarketDiscovery.vue'
import OfficialBundles from '@/components/OfficialBundles.vue'
import type { SkillBundle } from '@/lib/bundles'
import type { MarketItem } from '@/lib/market'

const emit = defineEmits<{
  openMarket: [item: MarketItem]
  openBundles: []
}>()

const { skills, detectedPlatforms } = useSkills()
const { projectRoots } = useSettings()
const { t } = useI18n()

const driftSkills = computed(() => skills.value.filter((s) => s.hasDrift))

const activeBundle = ref<SkillBundle | null>(null)

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
  },
  {
    icon: FolderGit2,
    label: t('dashboard.projectDirs'),
    desc: t('dashboard.projectDirsDesc'),
    value: projectRoots.value.length,
    tone: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  },
])
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
    <!-- stats -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card v-for="stat in stats" :key="stat.label">
        <CardContent class="flex flex-col gap-2 p-4">
          <div class="flex items-center gap-2.5">
            <span
              :class="['flex size-9 shrink-0 items-center justify-center rounded-full', stat.tone]"
            >
              <component :is="stat.icon" class="size-4" />
            </span>
            <span class="text-sm font-semibold">{{ stat.label }}</span>
          </div>
          <span
            :class="[
              'text-3xl font-bold tabular-nums tracking-tight',
              stat.warn && 'text-amber-600 dark:text-amber-400',
            ]"
          >
            {{ stat.value }}
          </span>
          <span class="text-xs text-muted-foreground">{{ stat.desc }}</span>
        </CardContent>
      </Card>
    </div>

    <!-- official bundles -->
    <OfficialBundles @use="activeBundle = $event" @more="emit('openBundles')" />

    <!-- marketplace discovery -->
    <MarketDiscovery @open="emit('openMarket', $event)" />

    <BundleSheet
      :open="activeBundle !== null"
      :bundle="activeBundle"
      @close="activeBundle = null"
    />
  </div>
</template>
