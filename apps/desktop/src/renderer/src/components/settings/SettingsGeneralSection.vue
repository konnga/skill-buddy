<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { LinkOpenMode } from '../../../../shared/ipc.js'
import type { Locale } from '../../i18n.js'
import { Select } from '@/components/ui/select'

const props = defineProps<{
  query: string
  searching: boolean
}>()

const language = defineModel<Locale>('language', { required: true })
const linkOpenMode = defineModel<LinkOpenMode>('linkOpenMode', { required: true })
const { t } = useI18n()

function visible(...texts: string[]): boolean {
  const query = props.query.trim().toLowerCase()
  return !query || texts.some((text) => text.toLowerCase().includes(query))
}
</script>

<template>
  <section class="mb-10">
    <h2 v-if="props.searching" class="mb-3 text-sm font-medium">
      {{ t('settings.catGeneral') }}
    </h2>
    <h2 v-else class="mb-3 text-sm font-medium">{{ t('settings.sectionLanguage') }}</h2>
    <div class="divide-y rounded-xl border">
      <div
        v-if="visible(t('settings.languageTitle'), t('settings.languageDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.languageTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.languageDesc') }}</p>
        </div>
        <Select
          v-model="language"
          class="w-36 shrink-0"
          :options="[
            { value: 'zh-CN', label: '中文' },
            { value: 'en', label: 'English' },
          ]"
        />
      </div>
      <div
        v-if="visible(t('settings.linkOpenTitle'), t('settings.linkOpenDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.linkOpenTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.linkOpenDesc') }}</p>
        </div>
        <Select
          v-model="linkOpenMode"
          class="w-36 shrink-0"
          :options="[
            { value: 'external', label: t('settings.linkOpenExternal') },
            { value: 'in-app', label: t('settings.linkOpenInApp') },
          ]"
        />
      </div>
    </div>
  </section>
</template>
