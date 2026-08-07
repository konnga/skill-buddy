<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useBundles } from '@/composables/useBundles'
import { bundleText, type SkillBundle } from '@/lib/bundles'
import { marketIconColor, marketIconGlyph } from '@/lib/market'

const emit = defineEmits<{ use: [bundle: SkillBundle] }>()

const { t, locale } = useI18n()
const { bundles, ensureLoaded } = useBundles()

onMounted(() => void ensureLoaded())
</script>

<template>
  <section>
    <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {{ t('bundles.title') }}
    </h3>
    <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <li v-for="b in bundles" :key="b.id">
        <div
          class="group flex h-full cursor-pointer flex-col gap-2 rounded-2xl border bg-card px-3.5 py-3.5 transition-colors hover:border-foreground/25"
          role="button"
          tabindex="0"
          @click="emit('use', b)"
          @keydown.enter="emit('use', b)"
        >
          <div class="flex items-center gap-2.5">
            <span
              :class="[
                'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white',
                marketIconColor(b.id),
              ]"
            >
              {{ marketIconGlyph(bundleText(b.name, locale)) }}
            </span>
            <span class="truncate text-sm font-semibold">{{ bundleText(b.name, locale) }}</span>
          </div>
          <p class="line-clamp-2 flex-1 text-xs text-muted-foreground">
            {{ bundleText(b.description, locale) }}
          </p>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">
              {{ t('bundles.skillCount', { n: b.skills.length }) }}
            </span>
            <Button
              size="sm"
              variant="outline"
              class="h-6 px-2.5 text-xs"
              @click.stop="emit('use', b)"
            >
              {{ t('bundles.use') }}
            </Button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
