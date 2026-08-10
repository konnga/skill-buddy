<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload, Search } from '@lucide/vue'
import type { RegistrySkillSummary } from '@skillbuddy/core'
import type { InstallTarget, RegistryConfig } from '../../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import CopyButton from '@/components/CopyButton.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkills } from '@/composables/useSkills'
import { agentLabel } from '@/lib/agents'
import { hasScriptResources } from '@/lib/resources'

const props = defineProps<{ config: RegistryConfig }>()
const { t } = useI18n()
const { skills, refresh } = useSkills()

const query = shallowRef('')
const items = ref<RegistrySkillSummary[]>([])
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)
const expanded = shallowRef<string | null>(null)
const scope = shallowRef('user')
const agents = ref<string[]>([])
const busy = shallowRef(false)
const detail = ref<{ content: string; resources?: Record<string, string> } | null>(null)
const detailLoading = shallowRef(false)

const localNames = computed(() => new Set(skills.value.map((skill) => skill.name)))

async function search(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    items.value = await window.skillsManager.registrySearch(props.config, query.value || undefined)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function toggleExpand(item: RegistrySkillSummary): Promise<void> {
  const key = `${item.org}/${item.name}`
  expanded.value = expanded.value === key ? null : key
  agents.value = []
  scope.value = 'user'
  error.value = null
  detail.value = null
  if (expanded.value !== key) return

  detailLoading.value = true
  try {
    detail.value = await window.skillsManager.registryGet(props.config, item.org, item.name)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    detailLoading.value = false
  }
}

async function install(item: RegistrySkillSummary): Promise<void> {
  if (agents.value.length === 0) return
  busy.value = true
  error.value = null
  try {
    const targets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    const results = await window.skillsManager.registryInstall(
      props.config,
      item.org,
      item.name,
      targets,
    )
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      error.value = failed
        .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
        .join('；')
      return
    }
    expanded.value = null
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

onMounted(search)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="query"
        :placeholder="t('team.searchPh')"
        class="pl-8"
        @keydown.enter="search"
      />
    </div>

    <p v-if="error" class="break-all text-sm text-destructive">
      {{ t('team.error', { msg: error }) }}
    </p>
    <div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">…</div>
    <p v-else-if="items.length === 0" class="py-16 text-center text-sm text-muted-foreground">
      {{ t('team.empty') }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="item in items"
        :key="`${item.org}/${item.name}`"
        class="rounded-md border px-4 py-3"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span class="select-text">
                <span class="text-muted-foreground">{{ item.org }}/</span>{{ item.name }}
              </span>
              <CopyButton :text="`${item.org}/${item.name}`" />
              <Badge variant="outline">v{{ item.version }}</Badge>
              <Badge v-for="tag in item.tags" :key="tag" variant="secondary" class="text-[10px]">
                {{ tag }}
              </Badge>
            </span>
            <span class="line-clamp-1 text-sm text-muted-foreground">
              {{ item.description || t('card.noDescription') }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge v-if="localNames.has(item.name)" variant="success">{{ t('team.installed') }}</Badge>
            <Button variant="outline" size="sm" @click="toggleExpand(item)">
              <CloudDownload />
              {{ t('team.install') }}
            </Button>
          </div>
        </div>

        <div
          v-if="expanded === `${item.org}/${item.name}`"
          class="mt-3 flex flex-col gap-2 border-t pt-3"
        >
          <div v-if="detailLoading" class="py-4 text-center text-sm text-muted-foreground">…</div>
          <template v-else-if="detail">
            <div
              v-if="hasScriptResources(detail.resources)"
              class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
            >
              {{ t('detail.scriptWarning') }}
            </div>
            <ScrollArea
              class="max-h-64 rounded-md border bg-muted/40"
              viewport-class="max-h-64 px-4 py-3"
            >
              <MarkdownView :content="detail.content" preview-id="team-skill-detail" />
            </ScrollArea>
            <ul v-if="detail.resources" class="flex flex-col gap-0.5">
              <li
                v-for="relativePath in Object.keys(detail.resources)"
                :key="relativePath"
                class="text-sm text-muted-foreground"
              >
                <code>{{ relativePath }}</code>
              </li>
            </ul>
          </template>
          <PlatformTargetPicker
            v-model:scope="scope"
            v-model:agents="agents"
            :label="t('team.installTo')"
          />
          <Button
            size="sm"
            class="w-fit"
            :disabled="busy || agents.length === 0"
            @click="install(item)"
          >
            {{ busy ? t('detail.installing') : t('detail.installN', { n: agents.length }) }}
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>
