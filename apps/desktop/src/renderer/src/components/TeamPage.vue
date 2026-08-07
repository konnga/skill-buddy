<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload, Search, Users } from '@lucide/vue'
import type { RegistrySkillSummary } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import MarkdownView from '@/components/MarkdownView.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CopyButton from '@/components/CopyButton.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import { agentLabel } from '@/lib/agents'
import { hasScriptResources } from '@/lib/resources'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const emit = defineEmits<{ openSettings: [] }>()

const { registryUrl, registryToken } = useSettings()
const { skills, refresh } = useSkills()
const { t } = useI18n()

const configured = computed(() => Boolean(registryUrl.value && registryToken.value))
const cfg = computed(() => ({ url: registryUrl.value, token: registryToken.value }))

const query = ref('')
const items = ref<RegistrySkillSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

/** which item's install picker is expanded, keyed by org/name */
const expanded = ref<string | null>(null)
const scope = ref('user')
const agents = ref<string[]>([])
const busy = ref(false)

const localNames = computed(() => new Set(skills.value.map((s) => s.name)))

const detail = ref<{ content: string; resources?: Record<string, string> } | null>(null)
const detailLoading = ref(false)

async function search(): Promise<void> {
  if (!configured.value) return
  loading.value = true
  error.value = null
  try {
    items.value = await window.skillsManager.registrySearch(cfg.value, query.value || undefined)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function toggleExpand(key: string, item?: RegistrySkillSummary): Promise<void> {
  expanded.value = expanded.value === key ? null : key
  agents.value = []
  scope.value = 'user'
  error.value = null
  detail.value = null
  if (expanded.value && item) {
    detailLoading.value = true
    try {
      detail.value = await window.skillsManager.registryGet(cfg.value, item.org, item.name)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      detailLoading.value = false
    }
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
      cfg.value,
      item.org,
      item.name,
      targets,
    )
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      error.value = failed.map((f) => `${agentLabel(f.target.agent)}: ${f.error}`).join('；')
      return
    }
    expanded.value = null
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

onMounted(search)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
    <!-- not configured -->
    <div
      v-if="!configured"
      class="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-16 text-center"
    >
      <Users class="size-8 text-muted-foreground" />
      <p class="max-w-sm text-sm text-muted-foreground">{{ t('team.configureHint') }}</p>
      <Button variant="outline" size="sm" @click="emit('openSettings')">
        {{ t('team.configureAction') }}
      </Button>
    </div>

    <template v-else>
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

      <p v-if="error" class="break-all text-xs text-destructive">
        {{ t('team.error', { msg: error }) }}
      </p>

      <div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">…</div>

      <p
        v-else-if="items.length === 0"
        class="py-16 text-center text-sm text-muted-foreground"
      >
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
              <span class="flex items-center gap-2 text-sm font-medium">
                <span class="select-text"
                  ><span class="text-muted-foreground">{{ item.org }}/</span>{{ item.name }}</span
                >
                <CopyButton :text="`${item.org}/${item.name}`" />
                <Badge variant="outline">v{{ item.version }}</Badge>
                <Badge v-for="tag in item.tags" :key="tag" variant="secondary" class="text-[10px]">
                  {{ tag }}
                </Badge>
              </span>
              <span class="line-clamp-1 text-xs text-muted-foreground">
                {{ item.description || t('card.noDescription') }}
              </span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Badge v-if="localNames.has(item.name)" variant="success">
                {{ t('team.installed') }}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                @click="toggleExpand(`${item.org}/${item.name}`, item)"
              >
                <CloudDownload />
                {{ t('team.install') }}
              </Button>
            </div>
          </div>
          <div
            v-if="expanded === `${item.org}/${item.name}`"
            class="mt-3 flex flex-col gap-2 border-t pt-3"
          >
            <div v-if="detailLoading" class="py-4 text-center text-xs text-muted-foreground">…</div>
            <template v-else-if="detail">
              <div
                v-if="hasScriptResources(detail.resources)"
                class="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
              >
                {{ t('detail.scriptWarning') }}
              </div>
              <div class="max-h-64 overflow-auto rounded-md border bg-muted/40 px-4 py-3">
                <MarkdownView :content="detail.content" preview-id="team-detail" />
              </div>
              <ul v-if="detail.resources" class="flex flex-col gap-0.5">
                <li
                  v-for="rel in Object.keys(detail.resources)"
                  :key="rel"
                  class="text-xs text-muted-foreground"
                >
                  <code>{{ rel }}</code>
                </li>
              </ul>
            </template>
            <span class="text-xs text-muted-foreground">{{ t('team.installTo') }}</span>
            <PlatformTargetPicker v-model:scope="scope" v-model:agents="agents" />
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
    </template>
  </div>
</template>
