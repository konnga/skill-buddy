<script setup lang="ts">
import { reactive, watch, type DeepReadonly } from 'vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { TeamLibraryBundleDraft, TeamLibraryMcpSummary, TeamLibrarySkillSummary } from '../../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  open: boolean
  initial?: TeamLibraryBundleDraft | null
  skills: readonly DeepReadonly<TeamLibrarySkillSummary>[]
  mcpServers: readonly DeepReadonly<TeamLibraryMcpSummary>[]
  busy?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ close: []; save: [value: TeamLibraryBundleDraft] }>()

const form = reactive<TeamLibraryBundleDraft>({ id: '', name: '', description: '', version: '', skills: [], mcp: [] })

function reset(): void {
  Object.assign(form, {
    originalPath: props.initial?.originalPath,
    id: props.initial?.id ?? '',
    name: props.initial?.name ?? '',
    description: props.initial?.description ?? '',
    version: props.initial?.version ?? '',
    skills: [...(props.initial?.skills ?? [])],
    mcp: [...(props.initial?.mcp ?? [])],
  })
}

watch(() => [props.open, props.initial], () => {
  if (props.open) reset()
}, { immediate: true })

function toggle(list: 'skills' | 'mcp', path: string): void {
  const values = form[list]
  const index = values.indexOf(path)
  if (index >= 0) values.splice(index, 1)
  else values.push(path)
}

function submit(): void {
  emit('save', {
    originalPath: form.originalPath,
    id: form.id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    version: form.version?.trim() || undefined,
    skills: [...form.skills],
    mcp: [...form.mcp],
  })
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none">
        <div class="border-b px-5 py-4">
          <DialogTitle class="text-base font-semibold">{{ initial ? '编辑岗位包' : '新增岗位包' }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">岗位包是团队推荐的一整套 Skills 和 MCP 工作环境。</DialogDescription>
        </div>
        <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="submit">
          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div class="grid gap-4 sm:grid-cols-3">
              <label class="grid gap-1.5 text-sm font-medium">ID<Input v-model="form.id" placeholder="frontend-developer" /></label>
              <label class="grid gap-1.5 text-sm font-medium">名称<Input v-model="form.name" placeholder="前端开发环境" /></label>
              <label class="grid gap-1.5 text-sm font-medium">版本<Input v-model="form.version" placeholder="1.0.0" /></label>
            </div>
            <label class="grid gap-1.5 text-sm font-medium">描述<Input v-model="form.description" /></label>
            <div class="grid gap-4 lg:grid-cols-2">
              <section class="overflow-hidden rounded-md border">
                <h3 class="border-b bg-muted/25 px-3 py-2 text-sm font-medium">Skills</h3>
                <label v-for="item in skills" :key="item.path" class="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                  <input type="checkbox" :checked="form.skills.includes(item.path)" class="mt-1" @change="toggle('skills', item.path)" />
                  <span class="min-w-0"><span class="block truncate font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.path }}</span></span>
                </label>
                <p v-if="!skills.length" class="px-3 py-6 text-center text-sm text-muted-foreground">暂无团队 Skills</p>
              </section>
              <section class="overflow-hidden rounded-md border">
                <h3 class="border-b bg-muted/25 px-3 py-2 text-sm font-medium">MCP Servers</h3>
                <label v-for="item in mcpServers" :key="item.path" class="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                  <input type="checkbox" :checked="form.mcp.includes(item.path)" class="mt-1" @change="toggle('mcp', item.path)" />
                  <span class="min-w-0"><span class="block truncate font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.path }}</span></span>
                </label>
                <p v-if="!mcpServers.length" class="px-3 py-6 text-center text-sm text-muted-foreground">暂无团队 MCP Servers</p>
              </section>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
            <p v-if="error" class="min-w-0 flex-1 break-all text-sm text-destructive">{{ error }}</p>
            <span v-else class="flex-1" />
            <div class="flex shrink-0 justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" class="cursor-pointer" @click="emit('close')">取消</Button>
              <Button type="submit" size="sm" class="cursor-pointer" :disabled="busy || !form.id.trim() || !form.name.trim() || form.skills.length + form.mcp.length === 0">{{ busy ? '保存中…' : '保存到变更' }}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
