<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import ColorSwatchField from '@/components/appearance/ColorSwatchField.vue'
import {
  applyPreset,
  exportAppearance,
  importAppearance,
  matchPreset,
  themePresets,
  useAppearance,
} from '@/composables/useAppearance'
import { showToast } from '@/composables/useToast'

/**
 * 深/浅色主题的自定义面板：预设、导入/复制、强调色/背景/前景、
 * 字体、半透明侧边栏与对比度。
 */
const props = defineProps<{ mode: 'light' | 'dark' }>()

const { t } = useI18n()
const { appearance } = useAppearance()

const colors = computed(() => appearance.value[props.mode])
const isMac = navigator.platform.toLowerCase().includes('mac')

const presetOptions = computed(() => {
  const options = themePresets.map((p) => ({ value: p.id, label: t(p.labelKey) }))
  if (matchPreset(props.mode) === 'custom') {
    options.push({ value: 'custom', label: t('settings.appearancePresetCustom') })
  }
  return options
})

const preset = computed({
  get: () => matchPreset(props.mode),
  set: (id) => {
    if (id && id !== 'custom') applyPreset(id)
  },
})

async function copyTheme(): Promise<void> {
  await navigator.clipboard.writeText(exportAppearance())
  showToast({ message: t('settings.appearanceCopied') })
}

/* 导入主题 */
const importOpen = ref(false)
const importText = ref('')
const importError = ref(false)

function openImport(): void {
  importText.value = ''
  importError.value = false
  importOpen.value = true
}

function confirmImport(): void {
  if (importAppearance(importText.value)) {
    importOpen.value = false
    showToast({ message: t('settings.appearanceImported') })
  } else {
    importError.value = true
  }
}
</script>

<template>
  <div class="rounded-2xl border">
    <!-- 面板头：标题 + 导入 / 复制 / 预设 -->
    <div class="flex items-center justify-between gap-3 px-5 py-3">
      <p class="text-sm font-medium">
        {{ t(mode === 'dark' ? 'settings.appearanceDarkTheme' : 'settings.appearanceLightTheme') }}
      </p>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="sm" class="text-muted-foreground" @click="openImport">
          {{ t('settings.appearanceImport') }}
        </Button>
        <Button variant="ghost" size="sm" class="text-muted-foreground" @click="copyTheme">
          {{ t('settings.appearanceCopy') }}
        </Button>
        <Select v-model="preset" :options="presetOptions" class="w-36">
          <template #value="{ option }">
            <span class="flex items-center gap-2">
              <span
                class="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
              >
                Aa
              </span>
              {{ option?.label }}
            </span>
          </template>
        </Select>
      </div>
    </div>

    <div class="divide-y border-t">
      <div class="flex items-center justify-between gap-6 px-5 py-3.5">
        <p class="text-sm">{{ t('settings.appearanceAccent') }}</p>
        <ColorSwatchField v-model="colors.accent" />
      </div>
      <div class="flex items-center justify-between gap-6 px-5 py-3.5">
        <p class="text-sm">{{ t('settings.appearanceBackground') }}</p>
        <ColorSwatchField v-model="colors.background" />
      </div>
      <div class="flex items-center justify-between gap-6 px-5 py-3.5">
        <p class="text-sm">{{ t('settings.appearanceForeground') }}</p>
        <ColorSwatchField v-model="colors.foreground" />
      </div>
      <div v-if="isMac" class="flex items-center justify-between gap-6 px-5 py-3.5">
        <p class="text-sm">{{ t('settings.appearanceTranslucent') }}</p>
        <Switch v-model="appearance.translucentSidebar" />
      </div>
      <div class="flex items-center justify-between gap-6 px-5 py-3.5">
        <p class="text-sm">{{ t('settings.appearanceContrast') }}</p>
        <div class="flex w-64 shrink-0 items-center gap-3">
          <Slider v-model="colors.contrast" :min="0" :max="100" :step="1" class="flex-1" />
          <span class="w-7 text-right text-sm tabular-nums text-muted-foreground">
            {{ colors.contrast }}
          </span>
        </div>
      </div>
    </div>

    <!-- 导入主题弹层 -->
    <Teleport to="body">
      <div
        v-if="importOpen"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-6"
        @click.self="importOpen = false"
      >
        <div class="w-[440px] rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
          <p class="text-sm font-medium">{{ t('settings.appearanceImportTitle') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t('settings.appearanceImportDesc') }}
          </p>
          <textarea
            v-model="importText"
            class="mt-3 h-40 w-full resize-none rounded-md border bg-transparent p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            :placeholder="t('settings.appearanceImportPh')"
          />
          <p v-if="importError" class="mt-1.5 text-sm text-destructive">
            {{ t('settings.appearanceImportInvalid') }}
          </p>
          <div class="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="importOpen = false">
              {{ t('common.cancel') }}
            </Button>
            <Button size="sm" @click="confirmImport">
              {{ t('settings.appearanceImport') }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
