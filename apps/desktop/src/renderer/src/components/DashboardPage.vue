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
}>()

const { skills, detectedPlatforms } = useSkills()
const { projectRoots } = useSettings()
const { t } = useI18n()

const driftSkills = computed(() => skills.value.filter((s) => s.hasDrift))

const activeBundle = ref<SkillBundle | null>(null)

const stats = computed(() => [
  { icon: Blocks, label: t('dashboard.totalSkills'), value: skills.value.length },
  {
    icon: MonitorCheck,
    label: t('dashboard.platformsDetected'),
    value: detectedPlatforms.value.length,
  },
  {
    icon: TriangleAlert,
    label: t('dashboard.driftCount'),
    value: driftSkills.value.length,
    warn: driftSkills.value.length > 0,
  },
  { icon: FolderGit2, label: t('dashboard.projectDirs'), value: projectRoots.value.length },
])
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
    <!-- stats -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card v-for="stat in stats" :key="stat.label">
        <CardContent class="flex flex-col gap-1 p-4">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <component
              :is="stat.icon"
              :class="['size-3.5', stat.warn && 'text-amber-500']"
            />
            {{ stat.label }}
          </div>
          <span
            :class="[
              'text-2xl font-semibold tabular-nums tracking-tight',
              stat.warn && 'text-amber-600 dark:text-amber-400',
            ]"
          >
            {{ stat.value }}
          </span>
        </CardContent>
      </Card>
    </div>

    <!-- official bundles -->
    <OfficialBundles @use="activeBundle = $event" />

    <!-- marketplace discovery -->
    <MarketDiscovery @open="emit('openMarket', $event)" />

    <BundleSheet
      :open="activeBundle !== null"
      :bundle="activeBundle"
      @close="activeBundle = null"
    />
  </div>
</template>
