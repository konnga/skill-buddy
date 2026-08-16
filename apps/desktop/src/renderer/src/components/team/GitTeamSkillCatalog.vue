<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { CloudDownload, GitCommitHorizontal, Search } from '@lucide/vue'
import type { InstallTarget, TeamLibrarySkillSummary } from '../../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../../shared/team-library.js'
import MarkdownView from '@/components/MarkdownView.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkills } from '@/composables/useSkills'
import { useSettings } from '@/composables/useSettings'
import { useTeamLibraries } from '@/composables/useTeamLibraries'
import { agentLabel } from '@/lib/agents'

const { teamLibraries } = useSettings()
const { skills: localSkills, refresh } = useSkills()
const { skills, catalogs, installations, refreshInstallations, policyState } = useTeamLibraries()
const query = shallowRef('')
const expanded = shallowRef<string | null>(null)
const detail = shallowRef<Awaited<ReturnType<typeof window.skillsManager.teamLibraryGetSkill>> | null>(null)
const agents = shallowRef<string[]>([])
const scope = shallowRef('user')
const busy = shallowRef(false)
const error = shallowRef<string | null>(null)

const visibleSkills = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle
    ? skills.value.filter((skill) =>
        [skill.name, skill.description, skill.libraryName, ...skill.tags].some((value) => value.toLowerCase().includes(needle)),
      )
    : skills.value
})
const localNames = computed(() => new Set(localSkills.value.map((skill) => skill.name)))
const required = computed(() => new Set(catalogs.value.flatMap((catalog) =>
  catalog.policy.required.skills.map((path) => `${catalog.source.libraryId}:${path}`),
)))
const installationStates = computed(() => {
  const states = new Map<string, 'current' | 'outdated' | 'missing'>()
  const rank = { missing: 0, outdated: 1, current: 2 }
  for (const item of installations.value) {
    if (item.type !== 'skill') continue
    const key = `${item.libraryId}:${item.path}`
    const status = item.status ?? (item.actualHash === item.contentHash ? 'current' : 'outdated')
    const previous = states.get(key)
    if (!previous || rank[status] > rank[previous]) states.set(key, status)
  }
  return states
})

function configFor(item: TeamLibrarySkillSummary) {
  const itemKey = teamLibraryConfigKey(item)
  const config = teamLibraries.value.find((library) => teamLibraryConfigKey(library) === itemKey)
  if (!config) throw new Error(`团队库配置不存在：${item.libraryId}`)
  return config
}

async function toggle(item: TeamLibrarySkillSummary): Promise<void> {
  const key = `${item.libraryId}:${item.path}`
  expanded.value = expanded.value === key ? null : key
  detail.value = null
  agents.value = []
  scope.value = 'user'
  error.value = null
  if (expanded.value !== key) return
  try {
    detail.value = await window.skillsManager.teamLibraryGetSkill(configFor(item), item.path)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function install(item: TeamLibrarySkillSummary): Promise<void> {
  if (agents.value.length === 0) return
  const state = policyState(item)
  if (state.blockedReason) {
    error.value = `该 Skill 已被团队策略禁用：${state.blockedReason}`
    return
  }
  busy.value = true
  error.value = null
  try {
    const targets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const results = await window.skillsManager.teamLibraryInstallSkill(configFor(item), item.path, targets)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      error.value = failed.map((result) => `${agentLabel(result.target.agent)}: ${result.error}`).join('；')
      return
    }
    expanded.value = null
    await Promise.all([refresh(), refreshInstallations()])
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" placeholder="搜索团队 Skills…" class="pl-8" />
    </div>
    <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
    <p v-if="visibleSkills.length === 0" class="py-16 text-center text-sm text-muted-foreground">
      团队库暂无 Skills
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="item in visibleSkills" :key="`${item.libraryId}:${item.path}`" class="rounded-md border px-4 py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span>{{ item.name }}</span>
              <Badge variant="outline">{{ item.libraryName }}</Badge>
              <Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge>
              <Badge
                v-if="required.has(`${item.libraryId}:${item.path}`)"
                variant="outline"
                class="border-amber-500/50 text-amber-700 dark:text-amber-400"
              >团队必装</Badge>
              <Badge v-if="policyState(item).recommended" variant="secondary">推荐</Badge>
              <Badge
                v-if="policyState(item).blockedReason"
                variant="outline"
                class="border-destructive/50 text-destructive"
              >已禁用</Badge>
            </div>
            <p class="line-clamp-1 text-sm text-muted-foreground">{{ item.description || '暂无描述' }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge
              v-if="installationStates.get(`${item.libraryId}:${item.path}`) === 'current'"
              variant="success"
            >已从此来源安装</Badge>
            <Badge
              v-else-if="installationStates.get(`${item.libraryId}:${item.path}`) === 'outdated'"
              variant="outline"
              class="border-amber-500/50 text-amber-700 dark:text-amber-400"
            >可升级</Badge>
            <Badge v-else-if="installationStates.get(`${item.libraryId}:${item.path}`) === 'missing'" variant="outline" class="border-destructive/50 text-destructive">本地安装已丢失</Badge>
            <Badge v-else-if="localNames.has(item.name)" variant="outline">存在同名本地 Skill</Badge>
            <Button variant="outline" size="sm" class="cursor-pointer" @click="toggle(item)">
              <CloudDownload />安装
            </Button>
          </div>
        </div>
        <div v-if="expanded === `${item.libraryId}:${item.path}`" class="mt-3 flex flex-col gap-3 border-t pt-3">
          <template v-if="detail">
            <div class="grid gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
              <span>{{ detail.path }}</span>
              <span class="flex items-center gap-1 font-mono"><GitCommitHorizontal class="size-3.5" />{{ detail.revision.slice(0, 12) }}</span>
            </div>
            <div v-if="detail.hasScripts" class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              该 Skill 包含脚本资源，请确认内容后再安装。
            </div>
            <ScrollArea class="max-h-64 rounded-md border bg-muted/40" viewport-class="max-h-64 px-4 py-3">
              <MarkdownView :content="detail.content" preview-id="git-team-skill-detail" />
            </ScrollArea>
          </template>
          <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" label="安装到" />
          <p v-if="policyState(item).blockedReason" class="text-sm text-destructive">
            禁用原因：{{ policyState(item).blockedReason }}
          </p>
          <Button
            size="sm"
            class="w-fit cursor-pointer"
            :disabled="busy || agents.length === 0 || Boolean(policyState(item).blockedReason)"
            @click="install(item)"
          >
            {{ busy ? '安装中…' : `安装到 ${agents.length} 个目标` }}
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>
