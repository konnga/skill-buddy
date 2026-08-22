<script setup lang="ts">
import { computed, shallowRef, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink, FileDiff, FolderOpen, GitPullRequest, RotateCcw } from '@lucide/vue'
import type { TeamContributionDiff, TeamContributionPublishResult } from '#shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  diff: DeepReadonly<TeamContributionDiff> | null
  result: DeepReadonly<TeamContributionPublishResult> | null
  busy: boolean
}>()
const emit = defineEmits<{ publish: [title: string, body: string]; open: []; discard: [] }>()
const { t } = useI18n()
const title = shallowRef(t('team.managementDefaultTitle'))
const body = shallowRef(t('team.managementDefaultBody'))
const canPublish = computed(() => Boolean(props.diff?.files.length && !props.diff?.issues?.length && title.value.trim()))

function openResult(): void {
  if (props.result?.url) void window.skillsManager.openLink(props.result.url)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm text-muted-foreground">{{ t('team.changesHint') }}</span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('open')"><FolderOpen />{{ t('team.openDirectory') }}</Button>
        <Button variant="ghost" size="sm" class="cursor-pointer" :disabled="busy" @click="emit('discard')"><RotateCcw />{{ t('team.discardDraft') }}</Button>
      </div>
    </div>

    <div v-if="diff?.issues?.length" class="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3">
      <p class="text-sm font-medium text-destructive">{{ t('team.publishIssues') }}</p>
      <ul class="mt-2 space-y-1 text-sm text-destructive">
        <li v-for="issue in diff.issues" :key="`${issue.path}:${issue.message}`"><code>{{ issue.path }}</code>：{{ issue.message }}</li>
      </ul>
    </div>

    <div v-if="diff?.files.length" class="overflow-hidden rounded-md border">
      <div class="flex items-center gap-2 border-b bg-muted/25 px-3 py-2 text-sm font-medium"><FileDiff class="size-4" />{{ t('team.pendingFiles', { n: diff.files.length }) }}</div>
      <ul class="divide-y">
        <li v-for="file in diff.files" :key="file.path" class="flex items-center gap-3 px-3 py-2 text-sm">
          <Badge variant="outline">{{ file.status }}</Badge><code class="truncate text-xs">{{ file.path }}</code>
        </li>
      </ul>
    </div>
    <p v-else class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">{{ t('team.noChanges') }}</p>

    <details v-if="diff?.patch" class="rounded-md border">
      <summary class="cursor-pointer px-3 py-2 text-sm font-medium">{{ t('team.viewDiff') }}</summary>
      <pre class="max-h-80 overflow-auto border-t bg-muted/20 px-3 py-3 text-xs leading-5">{{ diff.patch }}</pre>
    </details>

    <div class="grid gap-3 rounded-md border px-4 py-4">
      <label class="grid gap-1.5 text-sm font-medium">{{ t('team.contributionTitle') }}<Input v-model="title" /></label>
      <label class="grid gap-1.5 text-sm font-medium">{{ t('team.contributionBody') }}<textarea v-model="body" rows="4" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label>
      <Button class="w-fit cursor-pointer" size="sm" :disabled="!canPublish" :loading="busy" @click="emit('publish', title, body)"><GitPullRequest v-if="!busy" />{{ busy ? t('team.contributionPublishing') : t('team.contributionPublish') }}</Button>
    </div>

    <div v-if="result" class="rounded-md border px-4 py-3 text-sm">
      <p>{{ t('team.contributionPushed', { branch: result.branch }) }}</p>
      <p v-if="result.warning" class="mt-1 text-amber-700 dark:text-amber-400">{{ result.warning }}</p>
      <Button v-if="result.url" variant="link" class="mt-1 h-auto cursor-pointer p-0" @click="openResult"><ExternalLink />{{ t('team.contributionOpenRequest') }}</Button>
    </div>
  </div>
</template>
