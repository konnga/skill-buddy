<script setup lang="ts">
import { computed, shallowRef, type DeepReadonly } from 'vue'
import { ExternalLink, FileDiff, FolderOpen, GitPullRequest, RotateCcw } from '@lucide/vue'
import type { TeamContributionDiff, TeamContributionPublishResult } from '../../../../shared/ipc.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  diff: DeepReadonly<TeamContributionDiff> | null
  result: DeepReadonly<TeamContributionPublishResult> | null
  busy: boolean
}>()
const emit = defineEmits<{ publish: [title: string, body: string]; open: []; discard: [] }>()
const title = shallowRef('feat: 更新团队库资源')
const body = shallowRef('通过 SkillBuddy 团队库管理工作台提交。')
const canPublish = computed(() => Boolean(props.diff?.files.length && !props.diff?.issues?.length && title.value.trim()))

function openResult(): void {
  if (props.result?.url) void window.skillsManager.openLink(props.result.url)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm text-muted-foreground">所有资源操作都先进入当前 Git 变更分支。</span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('open')"><FolderOpen />打开目录</Button>
        <Button variant="ghost" size="sm" class="cursor-pointer" :disabled="busy" @click="emit('discard')"><RotateCcw />放弃当前草稿</Button>
      </div>
    </div>

    <div v-if="diff?.issues?.length" class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3">
      <p class="text-sm font-medium text-destructive">发布前需要修复以下问题</p>
      <ul class="mt-2 space-y-1 text-sm text-destructive">
        <li v-for="issue in diff.issues" :key="`${issue.path}:${issue.message}`"><code>{{ issue.path }}</code>：{{ issue.message }}</li>
      </ul>
    </div>

    <div v-if="diff?.files.length" class="overflow-hidden rounded-md border">
      <div class="flex items-center gap-2 border-b bg-muted/25 px-3 py-2 text-sm font-medium"><FileDiff class="size-4" />待发布文件 · {{ diff.files.length }}</div>
      <ul class="divide-y">
        <li v-for="file in diff.files" :key="file.path" class="flex items-center gap-3 px-3 py-2 text-sm">
          <Badge variant="outline">{{ file.status }}</Badge><code class="truncate text-xs">{{ file.path }}</code>
        </li>
      </ul>
    </div>
    <p v-else class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">当前分支还没有资源变更</p>

    <details v-if="diff?.patch" class="rounded-md border">
      <summary class="cursor-pointer px-3 py-2 text-sm font-medium">查看文件差异</summary>
      <pre class="max-h-80 overflow-auto border-t bg-muted/20 px-3 py-3 text-xs leading-5">{{ diff.patch }}</pre>
    </details>

    <div class="grid gap-3 rounded-md border px-4 py-4">
      <label class="grid gap-1.5 text-sm font-medium">变更标题<Input v-model="title" /></label>
      <label class="grid gap-1.5 text-sm font-medium">变更说明<textarea v-model="body" rows="4" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label>
      <Button class="w-fit cursor-pointer" size="sm" :disabled="busy || !canPublish" @click="emit('publish', title, body)"><GitPullRequest />{{ busy ? '发布中…' : '提交 PR / MR' }}</Button>
    </div>

    <div v-if="result" class="rounded-md border px-4 py-3 text-sm">
      <p>分支 <code>{{ result.branch }}</code> 已推送。</p>
      <p v-if="result.warning" class="mt-1 text-amber-700 dark:text-amber-400">{{ result.warning }}</p>
      <Button v-if="result.url" variant="link" class="mt-1 h-auto cursor-pointer p-0" @click="openResult"><ExternalLink />查看审核请求</Button>
    </div>
  </div>
</template>
