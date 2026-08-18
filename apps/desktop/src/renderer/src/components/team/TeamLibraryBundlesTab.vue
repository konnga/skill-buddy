<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { PackagePlus, Pencil, Trash2 } from '@lucide/vue'
import type { TeamLibraryCatalog } from '../../../../shared/ipc.js'
import { Button } from '@/components/ui/button'

type BundleEntry = DeepReadonly<TeamLibraryCatalog['bundles'][number]>

const props = defineProps<{ bundles: readonly BundleEntry[] }>()
const emit = defineEmits<{
  create: []
  edit: [item: BundleEntry]
  remove: [path: string]
}>()
</script>

<template>
  <section class="flex flex-col gap-3">
    <Button size="sm" class="w-fit cursor-pointer" @click="emit('create')">
      <PackagePlus />
      新增岗位包
    </Button>
    <p
      v-if="props.bundles.length === 0"
      class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
    >
      岗位包用于组合某个岗位需要的 Skills 与 MCP。
    </p>
    <ul v-else class="divide-y overflow-hidden rounded-md border">
      <li v-for="item in props.bundles" :key="item.path" class="flex items-center gap-3 px-4 py-3">
        <PackagePlus class="size-4 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ item.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ item.skills.length }} 个 Skills · {{ item.mcpServers.length }} 个 MCP
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer"
          title="编辑"
          @click="emit('edit', item)"
        >
          <Pencil class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer text-destructive"
          title="删除"
          @click="emit('remove', item.path)"
        >
          <Trash2 class="size-4" />
        </Button>
      </li>
    </ul>
  </section>
</template>
