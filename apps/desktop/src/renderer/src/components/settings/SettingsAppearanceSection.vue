<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ThemeCodePreview from '@/components/appearance/ThemeCodePreview.vue'
import ThemeModeCards from '@/components/appearance/ThemeModeCards.vue'
import ThemeStylePanel from '@/components/appearance/ThemeStylePanel.vue'
import type { ThemeMode } from '@/composables/useSettings'

const props = defineProps<{
  query: string
  effectiveMode: 'light' | 'dark'
}>()

const theme = defineModel<ThemeMode>('theme', { required: true })
const { t } = useI18n()

const sectionVisible = computed(() => {
  const query = props.query.trim().toLowerCase()
  if (!query) return true
  return [
    t('settings.sectionTheme'),
    t('settings.themeTitle'),
    t('settings.appearanceAccent'),
    t('settings.appearanceBackground'),
    t('settings.appearanceForeground'),
    t('settings.appearanceTranslucent'),
    t('settings.appearanceContrast'),
  ].some((text) => text.toLowerCase().includes(query))
})
</script>

<template>
  <section v-if="sectionVisible" class="mb-10">
    <h2 class="mb-4 text-sm font-medium">{{ t('settings.sectionTheme') }}</h2>
    <ThemeModeCards v-model="theme" />
    <div class="mt-5">
      <ThemeCodePreview :mode="props.effectiveMode" />
    </div>
    <div class="mt-5">
      <ThemeStylePanel :mode="props.effectiveMode" />
    </div>
  </section>
</template>
