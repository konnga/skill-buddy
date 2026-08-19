<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { PackagePlus, Pencil, Trash2 } from '@lucide/vue'
import type { TeamLibraryCatalog } from '#shared/ipc'
import { Button } from '@/components/ui/button'

type BundleEntry = DeepReadonly<TeamLibraryCatalog['bundles'][number]>

const props = defineProps<{ bundles: readonly BundleEntry[] }>()
const emit = defineEmits<{
  create: []
  edit: [item: BundleEntry]
  remove: [path: string]
}>()
const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-3">
    <Button size="sm" class="w-fit cursor-pointer" @click="emit('create')">
      <PackagePlus />
      {{ t('team.bundleCreate') }}
    </Button>
    <p
      v-if="props.bundles.length === 0"
      class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
    >
      {{ t('team.bundleManagementEmpty') }}
    </p>
    <ul v-else class="divide-y overflow-hidden rounded-md border">
      <li v-for="item in props.bundles" :key="item.path" class="flex items-center gap-3 px-4 py-3">
        <PackagePlus class="size-4 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ item.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ t('team.bundleMemberCounts', { skills: item.skills.length, mcp: item.mcpServers.length }) }}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer"
          :title="t('common.edit')"
          @click="emit('edit', item)"
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
