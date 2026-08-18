<script setup lang="ts">
import { computed } from 'vue'
import { Boxes, FilePlus2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'

const props = defineProps<{
  restoring: boolean
  libraryKey: string
  libraryOptions: SelectOption[]
  branchSlug: string
  busy: boolean
  canStart: boolean
}>()
const emit = defineEmits<{
  'update:libraryKey': [value: string]
  'update:branchSlug': [value: string]
  start: []
}>()

const libraryModel = computed({
  get: () => props.libraryKey,
  set: (value: string) => emit('update:libraryKey', value),
})
const branchModel = computed({
  get: () => props.branchSlug,
  set: (value: string) => emit('update:branchSlug', value),
})
</script>

<template>
  <div v-if="props.restoring" class="rounded-md border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
    正在恢复本地团队库草稿…
  </div>
  <div v-else class="rounded-md border border-dashed px-5 py-8">
    <div class="flex items-start gap-3">
      <Boxes class="mt-0.5 size-5 text-muted-foreground" />
      <div>
        <h2 class="text-sm font-semibold">管理团队资源</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          创建独立 Git 变更分支后，可在 SkillBuddy 中管理 Skills、MCP、岗位包和组织规范。
        </p>
      </div>
    </div>
    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      <label class="grid gap-1.5 text-sm font-medium">
        团队库
        <Select v-model="libraryModel" :options="props.libraryOptions" />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        分支标识
        <Input v-model="branchModel" placeholder="add-security-skill" />
      </label>
    </div>
    <Button
      class="mt-4 cursor-pointer"
      size="sm"
      :disabled="props.busy || !props.canStart"
      @click="emit('start')"
    >
      <FilePlus2 />
      {{ props.busy ? '准备中…' : '创建管理草稿' }}
    </Button>
  </div>
</template>
