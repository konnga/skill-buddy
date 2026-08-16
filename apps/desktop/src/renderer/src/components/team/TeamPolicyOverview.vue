<script setup lang="ts">
import { AlertTriangle, CircleCheck, RefreshCw, ShieldAlert, Sparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  missingRequired: number
  blockedInstalled: number
  updateAvailable: number
  recommendedMissing: number
}>()

const { t } = useI18n()
</script>

<template>
  <section class="grid overflow-hidden rounded-md border sm:grid-cols-2 lg:grid-cols-4">
    <div class="flex items-center gap-3 border-b px-3 py-3 sm:border-r lg:border-b-0">
      <ShieldAlert class="size-4 text-destructive" />
      <span>
        <span class="block text-lg font-semibold">{{ blockedInstalled }}</span>
        <span class="block text-xs text-muted-foreground">{{ t('team.policyBlocked') }}</span>
      </span>
    </div>
    <div class="flex items-center gap-3 border-b px-3 py-3 lg:border-b-0 lg:border-r">
      <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" />
      <span>
        <span class="block text-lg font-semibold">{{ missingRequired }}</span>
        <span class="block text-xs text-muted-foreground">{{ t('team.policyMissing') }}</span>
      </span>
    </div>
    <div class="flex items-center gap-3 border-r px-3 py-3">
      <RefreshCw class="size-4 text-blue-600 dark:text-blue-400" />
      <span>
        <span class="block text-lg font-semibold">{{ updateAvailable }}</span>
        <span class="block text-xs text-muted-foreground">{{ t('team.policyUpdates') }}</span>
      </span>
    </div>
    <div class="flex items-center gap-3 px-3 py-3">
      <Sparkles v-if="recommendedMissing > 0" class="size-4 text-muted-foreground" />
      <CircleCheck v-else class="size-4 text-emerald-600" />
      <span>
        <span class="block text-lg font-semibold">{{ recommendedMissing }}</span>
        <span class="block text-xs text-muted-foreground">{{ t('team.policyRecommended') }}</span>
      </span>
    </div>
  </section>
</template>
