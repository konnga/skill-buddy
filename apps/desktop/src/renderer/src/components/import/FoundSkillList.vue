<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { hasScriptResources } from '@/lib/resources'

const props = defineProps<{
  items: FoundSkill[]
  selected: Set<string>
  previewDir: string | null
  targets: InstallTarget[]
}>()
const emit = defineEmits<{
  toggle: [dir: string]
  preview: [dir: string]
  'update:targets': [value: InstallTarget[]]
}>()

const { t } = useI18n()
const targetsModel = computed({
  get: () => props.targets,
  set: (value: InstallTarget[]) => emit('update:targets', value),
})
</script>

<template>
  <p class="text-sm text-muted-foreground">
    {{ t('import.found', { n: props.items.length }) }}
  </p>
  <label
    v-for="item in props.items"
    :key="item.dir"
    class="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5"
  >
    <input
      type="checkbox"
      class="mt-0.5 cursor-pointer accent-foreground"
      :checked="props.selected.has(item.dir)"
      @change="emit('toggle', item.dir)"
    />
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex items-center gap-2 text-sm font-medium">
        {{ item.skill.name }}
        <Badge v-if="item.skill.version" variant="outline">v{{ item.skill.version }}</Badge>
        <Badge
          v-if="hasScriptResources(item.skill.resources)"
          variant="outline"
          class="border-amber-500/40 text-amber-600 dark:text-amber-400"
          :title="t('detail.scriptWarning')"
        >
          {{ t('import.hasScripts') }}
        </Badge>
      </span>
      <span class="line-clamp-1 text-sm text-muted-foreground">
        {{ item.skill.description || t('card.noDescription') }}
      </span>
      <button
        type="button"
        class="w-fit cursor-pointer text-sm text-muted-foreground underline-offset-2 hover:underline"
        @click.prevent.stop="emit('preview', item.dir)"
      >
        {{ t('import.viewContent') }} {{ props.previewDir === item.dir ? '−' : '+' }}
      </button>
      <ScrollArea
        v-if="props.previewDir === item.dir"
        class="max-h-56 rounded-md border bg-muted/40"
        viewport-class="max-h-56 px-3 py-2"
        @click.prevent.stop
      >
        <MarkdownView :content="item.skill.content" :preview-id="`import-${item.dir}`" />
      </ScrollArea>
      <ul
        v-if="props.previewDir === item.dir && item.skill.resources"
        class="flex flex-col gap-0.5"
      >
        <li
          v-for="relativePath in Object.keys(item.skill.resources)"
          :key="relativePath"
          class="text-sm text-muted-foreground"
        >
          <code>{{ relativePath }}</code>
        </li>
      </ul>
    </span>
  </label>

  <PlatformTargetPicker v-model="targetsModel" :label="t('import.targets')" />
</template>
