<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  query: string
  globalShortcutOk: boolean
  launchAtLoginReady: boolean
  desktopPreferencesReady: boolean
}>()

const autoRefresh = defineModel<boolean>('autoRefresh', { required: true })
const notifyDrift = defineModel<boolean>('notifyDrift', { required: true })
const confirmUninstall = defineModel<boolean>('confirmUninstall', { required: true })
const backgroundMode = defineModel<boolean>('backgroundMode', { required: true })
const launchAtLogin = defineModel<boolean>('launchAtLogin', { required: true })
const launchHidden = defineModel<boolean>('launchHidden', { required: true })
const globalShortcut = defineModel<string>('globalShortcut', { required: true })
const { t } = useI18n()

function visible(...texts: string[]): boolean {
  const query = props.query.trim().toLowerCase()
  return !query || texts.some((text) => text.toLowerCase().includes(query))
}
</script>

<template>
  <section class="mb-10">
    <h2 class="mb-3 text-sm font-medium">{{ t('settings.catBehavior') }}</h2>
    <div class="divide-y rounded-xl border">
      <div
        v-if="visible(t('settings.autoRefreshTitle'), t('settings.autoRefreshDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.autoRefreshTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.autoRefreshDesc') }}
          </p>
        </div>
        <Switch v-model="autoRefresh" />
      </div>
      <div
        v-if="visible(t('settings.notifyDriftTitle'), t('settings.notifyDriftDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.notifyDriftTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.notifyDriftDesc') }}
          </p>
        </div>
        <Switch v-model="notifyDrift" />
      </div>
      <div
        v-if="visible(t('settings.confirmUninstallTitle'), t('settings.confirmUninstallDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.confirmUninstallTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.confirmUninstallDesc') }}
          </p>
        </div>
        <Switch v-model="confirmUninstall" />
      </div>
      <div
        v-if="visible(t('settings.backgroundModeTitle'), t('settings.backgroundModeDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.backgroundModeTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.backgroundModeDesc') }}
          </p>
        </div>
        <Switch v-model="backgroundMode" :disabled="!props.desktopPreferencesReady" />
      </div>
      <div
        v-if="visible(t('settings.launchAtLoginTitle'), t('settings.launchAtLoginDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.launchAtLoginTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.launchAtLoginDesc') }}
          </p>
        </div>
        <Switch v-model="launchAtLogin" :disabled="!props.launchAtLoginReady" />
      </div>
      <div
        v-if="visible(t('settings.launchHiddenTitle'), t('settings.launchHiddenDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.launchHiddenTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.launchHiddenDesc') }}
          </p>
        </div>
        <Switch
          v-model="launchHidden"
          :disabled="
            !props.desktopPreferencesReady ||
            !props.launchAtLoginReady ||
            !backgroundMode ||
            !launchAtLogin
          "
        />
      </div>
      <div
        v-if="visible(t('settings.shortcutTitle'), t('settings.shortcutDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.shortcutTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.shortcutDesc') }}</p>
          <p v-if="globalShortcut && !props.globalShortcutOk" class="mt-0.5 text-sm text-destructive">
            {{ t('settings.shortcutInvalid') }}
          </p>
        </div>
        <Input
          v-model="globalShortcut"
          class="w-64 shrink-0 font-mono text-sm"
          :placeholder="t('settings.shortcutPh')"
        />
      </div>
    </div>
  </section>
</template>
