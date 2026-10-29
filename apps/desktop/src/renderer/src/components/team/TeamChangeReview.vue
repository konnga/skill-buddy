<script setup lang="ts">
import { computed, shallowRef, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, FileCode, FileDiff, FolderOpen, GitPullRequest, RotateCcw } from '@lucide/vue'
import type { TeamContributionDiff, TeamContributionPublishResult } from '#shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import TeamPublishResult from '@/components/team/TeamPublishResult.vue'
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
/** 变更文件可能几十个，默认展开但允许收起，方便往下看提交表单。 */
const filesOpen = shallowRef(true)
/** 差异正文很长，默认收起。 */
const patchOpen = shallowRef(false)
const canPublish = computed(() => Boolean(props.diff?.files.length && !props.diff?.issues?.length && title.value.trim()))

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
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 bg-muted/25 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
        :aria-expanded="filesOpen"
        @click="filesOpen = !filesOpen"
      >
        <FileDiff class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-left">{{ t('team.pendingFiles', { n: diff.files.length }) }}</span>
        <ChevronDown
          :class="['size-4 shrink-0 text-muted-foreground transition-transform', !filesOpen && '-rotate-90']"
        />
      </button>
      <ul v-if="filesOpen" class="divide-y border-t">
        <li v-for="file in diff.files" :key="file.path" class="flex items-center gap-3 px-3 py-2 text-sm">
          <Badge variant="outline">{{ file.status }}</Badge><code class="truncate text-xs">{{ file.path }}</code>
        </li>
      </ul>
    </div>
    <p v-else class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">{{ t('team.noChanges') }}</p>

    <div v-if="diff?.patch" class="overflow-hidden rounded-md border">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 bg-muted/25 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
        :aria-expanded="patchOpen"
        @click="patchOpen = !patchOpen"
      >
        <FileCode class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-left">{{ t('team.viewDiff') }}</span>
        <ChevronDown
          :class="['size-4 shrink-0 text-muted-foreground transition-transform', !patchOpen && '-rotate-90']"
        />
      </button>
      <pre v-if="patchOpen" class="max-h-80 overflow-auto border-t bg-muted/20 px-3 py-3 text-xs leading-5">{{ diff.patch }}</pre>
    </div>

    <div class="grid gap-3 rounded-md border px-4 py-4">
      <label class="grid gap-1.5 text-sm font-medium">{{ t('team.contributionTitle') }}<Input v-model="title" /></label>
      <label class="grid gap-1.5 text-sm font-medium">{{ t('team.contributionBody') }}<textarea v-model="body" rows="4" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label>
      <Button class="w-fit cursor-pointer" size="sm" :disabled="!canPublish" :loading="busy" @click="emit('publish', title, body)"><GitPullRequest v-if="!busy" />{{ busy ? t('team.contributionPublishing') : t('team.contributionPublish') }}</Button>
    </div>

    <TeamPublishResult :result="result" />
  </div>
</template>
