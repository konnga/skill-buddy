<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, Sparkles } from '@lucide/vue'
import type { InstallTarget } from '../../../../shared/ipc.js'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import {
  bundleRefToMarketItem,
  type BundleSkillRef,
} from '@/lib/bundles'
import type { MarketItem } from '@/lib/market'

const props = defineProps<{
  skills: BundleSkillRef[]
  selected: Set<string>
  targets: InstallTarget[]
  localSkillNames: Set<string>
  busy: boolean
}>()
const emit = defineEmits<{
  toggle: [name: string]
  open: [item: MarketItem]
  'update:targets': [value: InstallTarget[]]
}>()

const { t } = useI18n()
const targetsModel = computed({
  get: () => props.targets,
  set: (value: InstallTarget[]) => emit('update:targets', value),
})

function sourceLabel(skill: BundleSkillRef): string {
  return skill.source === 'skills-sh'
    ? skill.repo
    : `SkillHub · ${skill.namespace}/${skill.slug}`
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <Sparkles class="size-4 text-muted-foreground" />
      <h3 class="text-sm font-semibold">{{ t('bundles.skillsSection') }}</h3>
      <Badge variant="secondary">{{ props.skills.length }}</Badge>
    </div>
    <div class="flex flex-col gap-2">
      <div
        v-for="skill in props.skills"
        :key="skill.name"
        :class="[
          'flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
          props.busy
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:border-foreground/25',
        ]"
        role="button"
        tabindex="0"
        @click="!props.busy && emit('open', bundleRefToMarketItem(skill))"
        @keydown.enter="!props.busy && emit('open', bundleRefToMarketItem(skill))"
      >
        <input
          type="checkbox"
          class="size-4 cursor-pointer accent-foreground"
          :checked="props.selected.has(skill.name)"
          :disabled="props.busy"
          @click.stop
          @change="emit('toggle', skill.name)"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
            {{ skill.name }}
            <Badge v-if="props.localSkillNames.has(skill.name)" variant="success">
              {{ t('bundles.installedBadge') }}
            </Badge>
          </span>
          <span class="line-clamp-1 text-sm text-muted-foreground">
            {{ sourceLabel(skill) }}
          </span>
        </span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
    <PlatformTargetPicker v-model="targetsModel" :label="t('bundles.skillTargets')" />
  </section>
</template>
