<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@lucide/vue'
import BundleSkillSelection from '@/components/bundles/BundleSkillSelection.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBundleSkillInstall } from '@/composables/useBundleSkillInstall'
import {
  bundleGradient,
  bundleText,
  type SkillBundle,
} from '@/lib/bundles'
import { marketIconColor, marketIconGlyph, type MarketItem } from '@/lib/market'

const props = defineProps<{ bundle: SkillBundle; inset?: boolean }>()
const emit = defineEmits<{ close: []; openSkill: [item: MarketItem] }>()
const { t, locale } = useI18n()
const {
  selectedSkills,
  targets,
  busy,
  error,
  note,
  progress,
  selectedCount,
  installDisabled,
  localSkillNames,
  toggleSkill,
  setTargets,
  beginInstall,
} = useBundleSkillInstall({
  bundle: () => props.bundle,
  onInstalled: () => emit('close'),
})
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
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag cursor-pointer"
        @click="emit('close')"
      >
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="text-base font-semibold leading-5 tracking-tight">
        {{ bundleText(props.bundle.name, locale) }}
      </h1>
      <div class="flex-1" />
      <Button
        size="sm"
        class="app-no-drag cursor-pointer"
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
          :style="{ backgroundImage: bundleGradient(props.bundle.id) }"
        >
          <span
            :class="[
              'flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-white',
              marketIconColor(props.bundle.id),
            ]"
          >
            {{ marketIconGlyph(bundleText(props.bundle.name, locale)) }}
          </span>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="text-xl font-bold tracking-tight">
              {{ bundleText(props.bundle.name, locale) }}
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ bundleText(props.bundle.description, locale) }}
            </p>
            <span class="text-sm text-muted-foreground">
              {{ t('bundles.skillCount', { n: props.bundle.skills.length }) }}
            </span>
          </div>
        </div>

        <BundleSkillSelection
          v-if="props.bundle.skills.length"
          :skills="props.bundle.skills"
          :selected="selectedSkills"
          :targets="targets"
          :local-skill-names="localSkillNames"
          :busy="busy"
          @toggle="toggleSkill"
          @open="emit('openSkill', $event)"
          @update:targets="setTargets"
        />

        <div v-if="note || error" class="flex flex-col gap-2 border-t pt-4">
          <p v-if="note" class="text-sm text-amber-600 dark:text-amber-400">{{ note }}</p>
          <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
