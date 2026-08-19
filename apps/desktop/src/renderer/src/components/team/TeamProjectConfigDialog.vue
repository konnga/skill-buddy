<script setup lang="ts">
import { computed, ref, watch, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { TeamLibraryCatalog, TeamProjectConfig } from '../../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { TeamProjectCompliance } from '@/composables/useTeamProjects'

const props = defineProps<{
  open: boolean
  project: TeamProjectCompliance | null
  catalogs: readonly DeepReadonly<TeamLibraryCatalog>[]
  busy?: boolean
}>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t } = useI18n()

const libraryId = ref('')
const teams = ref<string[]>([])
const bundles = ref<string[]>([])
const skills = ref<string[]>([])
const mcp = ref<string[]>([])
const error = ref<string | null>(null)
const saving = ref(false)
let suppressNextLibraryChange = false

const libraryOptions = computed(() => props.catalogs.map((catalog) => ({
  value: catalog.source.libraryId,
  label: `${catalog.manifest.name} (${catalog.source.libraryId})`,
})))
const catalog = computed(() => props.catalogs.find((item) => item.source.libraryId === libraryId.value) ?? null)
const teamOptions = computed(() => catalog.value?.manifest.teams ?? [])
const bundleOptions = computed(() => catalog.value?.bundles ?? [])
const skillOptions = computed(() => catalog.value?.skills ?? [])
const mcpOptions = computed(() => catalog.value?.mcpServers ?? [])

function localRef(value: string, currentLibrary: string): string {
  const prefix = `${currentLibrary}:`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function reset(): void {
  const config = props.project?.config
  const selected = config?.library && props.catalogs.some((item) => item.source.libraryId === config.library)
    ? config.library
    : props.catalogs[0]?.source.libraryId ?? ''
  suppressNextLibraryChange = selected !== libraryId.value
  libraryId.value = selected
  teams.value = (config?.teams ?? []).map((item) => localRef(item, selected))
  bundles.value = (config?.requires.bundles ?? []).map((item) => localRef(item, selected))
  skills.value = (config?.requires.skills ?? []).map((item) => localRef(item, selected))
  mcp.value = (config?.requires.mcp ?? []).map((item) => localRef(item, selected))
  error.value = null
}

watch(() => [props.open, props.project], () => {
  if (props.open) reset()
}, { immediate: true })

watch(libraryId, (next, previous) => {
  if (suppressNextLibraryChange) {
    suppressNextLibraryChange = false
    return
  }
  if (!previous || next === previous) return
  teams.value = []
  bundles.value = []
  skills.value = []
  mcp.value = []
})

function toggle(values: string[], value: string): void {
  const index = values.indexOf(value)
  if (index >= 0) values.splice(index, 1)
  else values.push(value)
}

async function submit(): Promise<void> {
  if (!props.project || !libraryId.value) return
  saving.value = true
  error.value = null
  const config: TeamProjectConfig = {
    version: 1,
    library: libraryId.value,
    teams: [...teams.value],
    requires: {
      bundles: [...bundles.value],
      skills: [...skills.value],
      mcp: [...mcp.value],
    },
  }
  try {
    await window.skillsManager.teamProjectConfigWrite(props.project.projectRoot, config)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none">
        <div class="border-b px-5 py-4">
          <DialogTitle class="text-base font-semibold">{{ t('team.projectConfigTitle') }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('team.projectConfigHint') }}</DialogDescription>
        </div>
        <form class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" @submit.prevent="submit">
          <label class="grid gap-1.5 text-sm font-medium">{{ t('team.managementLibrary') }}<Select v-model="libraryId" :options="libraryOptions" /></label>
          <template v-if="catalog">
            <section v-if="teamOptions.length" class="rounded-md border">
              <h3 class="border-b bg-muted/25 px-3 py-2 text-sm font-medium">{{ t('team.projectTeamPolicies') }}</h3>
              <label v-for="item in teamOptions" :key="item.id" class="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <input type="checkbox" :checked="teams.includes(item.id)" class="mt-1" @change="toggle(teams, item.id)" />
                <span><span class="block font-medium">{{ item.name }}</span><span class="block text-xs text-muted-foreground">{{ item.id }}</span></span>
              </label>
            </section>
            <div class="grid gap-4 lg:grid-cols-2">
              <section class="overflow-hidden rounded-md border">
                <h3 class="border-b bg-muted/25 px-3 py-2 text-sm font-medium">{{ t('team.bundlesTab') }}</h3>
                <label v-for="item in bundleOptions" :key="item.path" class="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                  <input type="checkbox" :checked="bundles.includes(item.id)" class="mt-1" @change="toggle(bundles, item.id)" />
                  <span class="min-w-0"><span class="block truncate font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.id }}</span></span>
                </label>
                <p v-if="!bundleOptions.length" class="px-3 py-6 text-center text-sm text-muted-foreground">{{ t('team.projectNoBundles') }}</p>
              </section>
              <section class="overflow-hidden rounded-md border">
                <h3 class="border-b bg-muted/25 px-3 py-2 text-sm font-medium">Skills</h3>
                <label v-for="item in skillOptions" :key="item.path" class="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                  <input type="checkbox" :checked="skills.includes(item.path)" class="mt-1" @change="toggle(skills, item.path)" />
                  <span class="min-w-0"><span class="block truncate font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.path }}</span></span>
                </label>
                <p v-if="!skillOptions.length" class="px-3 py-6 text-center text-sm text-muted-foreground">{{ t('team.projectNoSkills') }}</p>
              </section>
            </div>
            <section class="overflow-hidden rounded-md border">
              <h3 class="border-b bg-muted/25 px-3 py-2 text-sm font-medium">MCP Servers</h3>
              <label v-for="item in mcpOptions" :key="item.path" class="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <input type="checkbox" :checked="mcp.includes(item.path)" class="mt-1" @change="toggle(mcp, item.path)" />
                <span class="min-w-0"><span class="block truncate font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.path }}</span></span>
              </label>
              <p v-if="!mcpOptions.length" class="px-3 py-6 text-center text-sm text-muted-foreground">{{ t('team.projectNoMcp') }}</p>
            </section>
          </template>
          <p v-if="!catalog" class="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{{ t('team.projectLibraryUnavailable') }}</p>
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        </form>
        <div class="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('close')">{{ t('common.cancel') }}</Button>
          <Button size="sm" class="cursor-pointer" :disabled="busy || saving || !catalog" @click="submit">{{ busy || saving ? t('team.saving') : t('team.projectSaveConfig') }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
