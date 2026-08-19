<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, FileText, LoaderCircle } from '@lucide/vue'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '#shared/ipc'
import MarkdownView from '@/components/MarkdownView.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  artifact: FoundSkill
  targets: InstallTarget[]
  installing: boolean
  installError: string | null
  installed: boolean
}>()
const emit = defineEmits<{
  'update:targets': [value: InstallTarget[]]
  install: []
}>()

const { t } = useI18n()
const targetsModel = computed({
  get: () => props.targets,
  set: (value: InstallTarget[]) => emit('update:targets', value),
})
</script>

<template>
  <section class="overflow-hidden rounded-lg border">
    <div class="flex items-start gap-3 border-b bg-muted/20 px-4 py-3">
      <FileText class="mt-0.5 size-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-sm font-semibold">{{ props.artifact.skill.name }}</h3>
          <span
            v-if="props.installed"
            class="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <Check class="size-3.5" />
            {{ t('newSkill.installed') }}
          </span>
        </div>
        <p class="mt-1 text-sm leading-5 text-muted-foreground">
          {{ props.artifact.skill.description }}
        </p>
      </div>
    </div>
    <div class="max-h-80 overflow-y-auto px-4 py-3">
      <MarkdownView :content="props.artifact.skill.content" preview-id="new-skill-artifact" />
    </div>
    <div class="flex flex-col gap-3 border-t px-4 py-3">
      <PlatformTargetPicker v-model="targetsModel" :label="t('team.installTo')" />
      <div class="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          class="cursor-pointer"
          :disabled="props.installing || props.targets.length === 0 || props.installed"
          @click="emit('install')"
        >
          <LoaderCircle v-if="props.installing" class="size-3.5 animate-spin" />
          <Check v-else class="size-3.5" />
          {{
            props.installed
              ? t('newSkill.installed')
              : props.installing
                ? t('newSkill.installing')
                : t('newSkill.installN', { n: props.targets.length })
          }}
        </Button>
        <p v-if="props.installError" class="break-all text-sm text-destructive">
          {{ props.installError }}
        </p>
      </div>
    </div>
  </section>
</template>
