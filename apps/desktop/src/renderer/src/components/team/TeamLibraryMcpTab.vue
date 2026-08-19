<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { LibraryBig, Pencil, ServerCog, Trash2 } from '@lucide/vue'
import type { TeamLibraryCatalog } from '../../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type McpEntry = DeepReadonly<TeamLibraryCatalog['mcpServers'][number]>

const props = defineProps<{ mcpServers: readonly McpEntry[] }>()
const emit = defineEmits<{
  market: []
  edit: [path: string]
  remove: [path: string]
}>()
const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">{{ t('team.mcpMarketHint') }}</p>
      <Button size="sm" class="cursor-pointer" @click="emit('market')">
        <LibraryBig />
        {{ t('team.mcpMarketAdd') }}
      </Button>
    </div>
    <p
      v-if="props.mcpServers.length === 0"
      class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
    >
      {{ t('team.mcpDraftEmpty') }}
    </p>
    <ul v-else class="divide-y overflow-hidden rounded-md border">
      <li
        v-for="item in props.mcpServers"
        :key="item.path"
        class="flex items-center gap-3 px-4 py-3"
      >
        <ServerCog class="size-4 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ item.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ item.description || item.path }}
          </span>
        </span>
        <Badge variant="secondary">{{ item.transport }}</Badge>
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
