<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileCog, FolderInput, Pencil, Plus, Trash2 } from '@lucide/vue'
import type { TeamLibraryCatalog } from '#shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type InstructionEntry = DeepReadonly<TeamLibraryCatalog['instructions'][number]>

const props = defineProps<{ instructions: readonly InstructionEntry[] }>()
const emit = defineEmits<{
  create: []
  local: []
  edit: [path: string]
  remove: [path: string]
}>()
const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">
        {{ t('team.instructionTemplateHint') }}
      </p>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="cursor-pointer"
          @click="emit('local')"
        >
          <FolderInput class="size-4" />
          {{ t('team.localInstructionAdd') }}
        </Button>
        <Button
          size="sm"
          class="cursor-pointer"
          @click="emit('create')"
        >
          <Plus class="size-4" />
          {{ t('team.instructionTemplateCreate') }}
        </Button>
      </div>
    </div>
    <p
      v-if="props.instructions.length === 0"
      class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
    >
      {{ t('team.instructionTemplateEmpty') }}
    </p>
    <ul
      v-else
      class="divide-y overflow-hidden rounded-md border"
    >
      <li
        v-for="item in props.instructions"
        :key="item.path"
        class="flex items-center gap-3 px-4 py-3"
      >
        <FileCog class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ item.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ item.target }} · {{ item.path }}
          </span>
        </span>
        <Badge
          v-if="item.version"
          variant="secondary"
        >
          v{{ item.version }}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer"
          :title="t('common.edit')"
          @click="emit('edit', item.path)"
        >
          <Pencil class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer text-destructive"
          :title="t('common.delete')"
          @click="emit('remove', item.path)"
        >
          <Trash2 class="size-4" />
        </Button>
      </li>
    </ul>
  </section>
</template>
