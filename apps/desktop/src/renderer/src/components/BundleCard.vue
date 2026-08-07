<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { bundleGradient, bundleText, type SkillBundle } from '@/lib/bundles'
import { marketIconColor, marketIconGlyph } from '@/lib/market'

defineProps<{ bundle: SkillBundle }>()
const emit = defineEmits<{ use: [] }>()

const { t, locale } = useI18n()
</script>

<template>
  <div
    class="group flex h-full cursor-pointer flex-col gap-2 rounded-2xl border bg-card px-3.5 py-3.5 transition-colors hover:border-foreground/25"
    :style="{ backgroundImage: bundleGradient(bundle.id) }"
    role="button"
    tabindex="0"
    @click="emit('use')"
    @keydown.enter="emit('use')"
  >
    <div class="flex items-center gap-2.5">
      <span
        :class="[
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white',
          marketIconColor(bundle.id),
        ]"
      >
        {{ marketIconGlyph(bundleText(bundle.name, locale)) }}
      </span>
      <span class="truncate text-sm font-semibold">{{ bundleText(bundle.name, locale) }}</span>
    </div>
    <p class="line-clamp-2 flex-1 text-xs text-muted-foreground">
      {{ bundleText(bundle.description, locale) }}
    </p>
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted-foreground">
        {{ t('bundles.skillCount', { n: bundle.skills.length }) }}
      </span>
      <Button size="sm" variant="outline" class="h-6 bg-transparent px-2.5 text-xs" @click.stop="emit('use')">
        {{ t('bundles.use') }}
      </Button>
    </div>
  </div>
</template>
