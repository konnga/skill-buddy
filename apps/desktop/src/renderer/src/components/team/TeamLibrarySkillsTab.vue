<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import { LibraryBig, Pencil, Sparkles, Trash2 } from '@lucide/vue'
import type { TeamLibraryCatalog } from '../../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type SkillEntry = DeepReadonly<TeamLibraryCatalog['skills'][number]>

const props = defineProps<{ skills: readonly SkillEntry[] }>()
const emit = defineEmits<{
  market: []
  edit: [path: string]
  remove: [path: string]
}>()
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">从 Skills 市场精选统一使用的资源。</p>
      <Button size="sm" class="cursor-pointer" @click="emit('market')">
        <LibraryBig />
        从 Skills 市场添加
      </Button>
    </div>
    <p
      v-if="props.skills.length === 0"
      class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
    >
      团队库还没有 Skills，请从 Skills 市场选择资源加入当前草稿。
    </p>
    <ul v-else class="divide-y overflow-hidden rounded-md border">
      <li v-for="item in props.skills" :key="item.path" class="flex items-center gap-3 px-4 py-3">
        <Sparkles class="size-4 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ item.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ item.description || item.path }}
          </span>
        </span>
        <Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge>
        <Button
          variant="ghost"
          size="icon"
          class="cursor-pointer"
          title="编辑"
          @click="emit('edit', item.path)"
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
