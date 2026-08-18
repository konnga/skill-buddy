<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'

const props = defineProps<{ query: string }>()
const githubToken = defineModel<string>('githubToken', { required: true })
const proxyUrl = defineModel<string>('proxyUrl', { required: true })
const { t } = useI18n()

function visible(...texts: string[]): boolean {
  const query = props.query.trim().toLowerCase()
  return !query || texts.some((text) => text.toLowerCase().includes(query))
}
</script>

<template>
  <section class="mb-10">
    <h2 class="mb-3 text-sm font-medium">{{ t('settings.catNetwork') }}</h2>
    <div class="divide-y rounded-xl border">
      <div
        v-if="visible(t('settings.githubTokenTitle'), t('settings.githubTokenDesc'))"
        class="flex flex-col gap-2 px-5 py-4"
      >
        <p class="text-sm font-medium">{{ t('settings.githubTokenTitle') }}</p>
        <p class="text-sm text-muted-foreground">{{ t('settings.githubTokenDesc') }}</p>
        <Input
          v-model="githubToken"
          type="password"
          class="text-sm"
          :placeholder="t('settings.githubTokenPh')"
        />
      </div>
      <div
        v-if="visible(t('settings.proxyTitle'), t('settings.proxyDesc'))"
        class="flex flex-col gap-2 px-5 py-4"
      >
        <p class="text-sm font-medium">{{ t('settings.proxyTitle') }}</p>
        <p class="text-sm text-muted-foreground">{{ t('settings.proxyDesc') }}</p>
        <Input v-model="proxyUrl" class="text-sm" :placeholder="t('settings.proxyPh')" />
      </div>
    </div>
  </section>
</template>
