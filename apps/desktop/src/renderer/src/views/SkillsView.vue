<script setup lang="ts">
import { computed, ref } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import {
  CloudDownload,
  FolderOpen,
  Import,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import SkillCard from '@/components/SkillCard.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGroups } from '@/composables/useGroups'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{
  openSkill: [skill: AggregatedSkill]
  editSkill: [skill: AggregatedSkill]
  newSkill: []
  importSkills: []
}>()

const { t } = useI18n()
const {
  detectedPlatforms,
  loading,
  error,
  search,
  driftOnly,
  platformFilter,
  ownershipFilter,
  sortBy,
  filtered,
  skills,
  refresh,
  setEnabled,
} = useSkills()
const removing = ref<Set<string>>(new Set())
const toggling = ref<Set<string>>(new Set())
const pendingUninstall = ref<{ skill: AggregatedSkill; platformId: string | null } | null>(null)
const pendingToggle = ref<{
  skill: AggregatedSkill
  platformId: string | null
  enabled: boolean
  count: number
} | null>(null)
const pendingUninstallInstallations = computed(() => {
  const request = pendingUninstall.value
  if (!request) return []
  return request.skill.installations.filter(
    (installation) =>
      !installation.readOnly &&
      (request.platformId === null || installation.agent === request.platformId),
  )
})
const pendingUninstallCount = computed(
  () => pendingUninstallInstallations.value.length,
)
const {
  groupFilter,
  groupApplyOpen,
  groupApplyScope,
  groupApplyAgents,
  groupApplyBusy,
  groupApplyNote,
  activeTemp,
  groupCount,
  applyGroup,
  applyGroupTemp,
  endTemp,
} = useGroups()

const sortOptions = computed(() => [
  { value: 'name', label: t('sort.name') },
  { value: 'recent', label: t('sort.recent') },
])

const ownershipModel = computed({
  get: () => ownershipFilter.value ?? 'all',
  set: (value: string) => {
    ownershipFilter.value = value === 'managed' || value === 'agent' ? value : null
  },
})

const ownershipOptions = computed(() => [
  { value: 'all', label: t('app.allSources') },
  { value: 'managed', label: t('app.managedByMe') },
  { value: 'agent', label: t('app.managedByAgent') },
])

async function uninstallSkill(skill: AggregatedSkill, platformId: string | null): Promise<void> {
  if (removing.value.has(skill.name)) return
  const paths = skill.installations
    .filter(
      (installation) =>
        !installation.readOnly &&
        (platformId === null || installation.agent === platformId),
    )
    .map((installation) => installation.path)
  if (paths.length === 0) return

  removing.value = new Set([...removing.value, skill.name])
  try {
    const { token, results } = await window.skillsManager.trashUndoable(paths)
    const completed = results.filter((result) => result.ok).length
    const failed = results.length - completed
    if (completed > 0) {
      await refresh({ silent: true })
      showToast({
        message:
          failed > 0
            ? t('card.uninstallPartial', { completed, failed })
            : t('common.trashedN', { n: completed }),
        actionLabel: t('common.undo'),
        onAction: async () => {
          if (await window.skillsManager.undoTrash(token)) {
            await refresh({ silent: true })
            showToast({ message: t('common.restored') })
          }
        },
      })
    } else {
      showToast({ message: t('card.uninstallFailed') })
    }
  } catch {
    showToast({ message: t('card.uninstallFailed') })
  } finally {
    const next = new Set(removing.value)
    next.delete(skill.name)
    removing.value = next
  }
}

async function confirmUninstall(): Promise<void> {
  const request = pendingUninstall.value
  if (!request) return
  await uninstallSkill(request.skill, request.platformId)
  pendingUninstall.value = null
}

function requestUninstall(skill: AggregatedSkill, platformId: string | null): void {
  pendingUninstall.value = { skill, platformId }
}

function updateUninstallDialog(open: boolean): void {
  if (
    !open &&
    pendingUninstall.value &&
    !removing.value.has(pendingUninstall.value.skill.name)
  ) {
    pendingUninstall.value = null
  }
}

async function toggleSkill(
  skill: AggregatedSkill,
  platformId: string | null,
  enabled: boolean,
): Promise<void> {
  if (toggling.value.has(skill.name)) return
  const targets = skill.installations.filter(
    (installation) =>
      !installation.readOnly &&
      (platformId === null || installation.agent === platformId),
  )
  if (targets.length === 0) return

  toggling.value = new Set([...toggling.value, skill.name])
  try {
    const results = await setEnabled(
      skill.name,
      targets.map((installation) => ({
        agent: installation.agent,
        scope: installation.scope,
        projectRoot: installation.projectRoot,
      })),
      enabled,
    )
    const failed = results.filter((result) => !result.ok)
    const completed = results.length - failed.length
    if (completed > 0) {
      showToast({
        message: platformId
          ? t(enabled ? 'card.enabledOnPlatform' : 'card.disabledOnPlatform', {
              platform: agentLabel(platformId),
              n: completed,
            })
          : t(enabled ? 'card.enabledN' : 'card.disabledN', { n: completed }),
      })
    }
    if (failed.length > 0) {
      showToast({ message: failed.map((result) => result.error).join('；') })
    }
  } finally {
    const next = new Set(toggling.value)
    next.delete(skill.name)
    toggling.value = next
  }
}

function requestToggle(skill: AggregatedSkill): void {
  const platformId = platformFilter.value
  const targets = skill.installations.filter(
    (installation) =>
      !installation.readOnly &&
      (platformId === null || installation.agent === platformId),
  )
  if (targets.length === 0) return
  const enabled = targets.every((installation) => installation.enabled === false)
  if (platformId === null) {
    pendingToggle.value = { skill, platformId, enabled, count: targets.length }
    return
  }
  void toggleSkill(skill, platformId, enabled)
}

async function confirmToggle(): Promise<void> {
  const request = pendingToggle.value
  if (!request) return
  pendingToggle.value = null
  await toggleSkill(request.skill, request.platformId, request.enabled)
}

function updateToggleDialog(open: boolean): void {
  if (!open && pendingToggle.value && !toggling.value.has(pendingToggle.value.skill.name)) {
    pendingToggle.value = null
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <div class="app-no-drag relative w-72">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="search" :placeholder="t('app.searchPlaceholder')" class="pl-8" />
      </div>
      <Select v-model="ownershipModel" class="app-no-drag" :options="ownershipOptions" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        :aria-pressed="driftOnly"
        :class="[
          'app-no-drag cursor-pointer gap-1.5 px-2.5 font-normal [&_svg]:size-3.5',
          driftOnly
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400'
            : 'text-foreground hover:border-foreground/40 hover:bg-background',
        ]"
        @click="driftOnly = !driftOnly"
      >
        <TriangleAlert class="size-3.5" />
        {{ t('app.driftOnly') }}
      </Button>
      <Select v-model="sortBy" class="app-no-drag" :options="sortOptions" />
      <Button
        v-if="groupFilter"
        variant="outline"
        size="sm"
        class="app-no-drag"
        @click="groupApplyOpen = !groupApplyOpen"
      >
        <CloudDownload class="size-3.5" />
        {{ t('groups.applyTitle') }}
      </Button>
      <div class="flex-1" />
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('newSkill')">
        <Plus />
      </Button>
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('importSkills')">
        <Import />
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag"
        :disabled="loading"
        @click="refresh"
      >
        <RefreshCw :class="loading ? 'animate-spin' : ''" />
        {{ t('app.rescan') }}
      </Button>
    </header>

    <ScrollArea class="flex-1" viewport-class="px-6 py-5">
      <div
        v-if="groupFilter && groupApplyOpen"
        class="mb-4 flex flex-col gap-2 rounded-lg border px-4 py-3"
      >
        <PlatformTargetPicker
          v-model:scope="groupApplyScope"
          v-model:agents="groupApplyAgents"
          :label="t('groups.applyTitle')"
        />
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            :disabled="groupApplyBusy || groupApplyAgents.length === 0 || groupCount(groupFilter) === 0"
            @click="applyGroup"
          >
            {{
              groupApplyBusy
                ? t('detail.installing')
                : t('groups.apply', { n: groupCount(groupFilter) })
            }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="groupApplyBusy || groupApplyAgents.length === 0 || groupCount(groupFilter) === 0"
            @click="applyGroupTemp"
          >
            {{ t('groups.applyTemp') }}
          </Button>
        </div>
        <p class="text-sm text-muted-foreground">{{ t('groups.tempHint') }}</p>
        <p v-if="groupApplyNote" class="text-sm text-amber-600 dark:text-amber-400">
          {{ groupApplyNote }}
        </p>
      </div>

      <div
        v-if="groupFilter && activeTemp"
        class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5"
      >
        <span class="text-sm text-sky-700 dark:text-sky-400">
          {{ t('groups.tempActive', { n: activeTemp.installed.length }) }}
        </span>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0"
          :disabled="groupApplyBusy"
          @click="endTemp(groupFilter)"
        >
          {{ t('groups.endTemp') }}
        </Button>
      </div>

      <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.scanning') }}
      </div>
      <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>
      <div
        v-else-if="skills.length === 0"
        class="flex flex-col items-center gap-3 py-24 text-muted-foreground"
      >
        <FolderOpen class="size-10" />
        <p class="text-sm">{{ t('app.empty') }}</p>
        <p class="max-w-sm text-center text-sm">
          {{ t('app.emptyHint', { n: detectedPlatforms.length }) }}
        </p>
      </div>
      <div v-else-if="filtered.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.noMatch', { q: search }) }}
      </div>
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SkillCard
          v-for="skill in filtered"
          :key="skill.name"
          :skill="skill"
          :busy="removing.has(skill.name) || toggling.has(skill.name)"
          :current-platform="platformFilter ?? undefined"
          @open="emit('openSkill', skill)"
          @edit="emit('editSkill', skill)"
          @toggle-enabled="requestToggle(skill)"
          @uninstall-current="requestUninstall(skill, platformFilter)"
          @uninstall-all="requestUninstall(skill, null)"
        />
      </div>
    </ScrollArea>

    <DialogRoot
      :open="Boolean(pendingUninstall)"
      @update:open="updateUninstallDialog"
    >
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">
            {{
              pendingUninstall?.platformId
                ? t('card.uninstallCurrentTitle')
                : t('card.uninstallAllTitle')
            }}
          </DialogTitle>
          <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
            <I18nT
              :keypath="
                pendingUninstall?.platformId
                  ? 'card.uninstallCurrentConfirm'
                  : 'card.uninstallAllConfirm'
              "
              tag="span"
            >
              <template #name>
                <strong class="font-semibold text-foreground">
                  {{ pendingUninstall?.skill.name }}
                </strong>
              </template>
              <template #platform>
                <strong class="font-semibold text-foreground">
                  {{ pendingUninstall?.platformId ? agentLabel(pendingUninstall.platformId) : '' }}
                </strong>
              </template>
              <template #n>{{ pendingUninstallCount }}</template>
            </I18nT>
          </DialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              :disabled="Boolean(pendingUninstall && removing.has(pendingUninstall.skill.name))"
              @click="pendingUninstall = null"
            >
              {{ t('common.cancel') }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="Boolean(pendingUninstall && removing.has(pendingUninstall.skill.name))"
              @click="confirmUninstall"
            >
              {{
                pendingUninstall?.platformId
                  ? t('card.uninstallCurrentAction')
                  : t('card.uninstallAllAction')
              }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot :open="Boolean(pendingToggle)" @update:open="updateToggleDialog">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">
            {{
              pendingToggle?.enabled
                ? t('card.enableAllTitle')
                : t('card.disableAllTitle')
            }}
          </DialogTitle>
          <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
            {{
              t(
                pendingToggle?.enabled
                  ? 'card.enableAllConfirm'
                  : 'card.disableAllConfirm',
                {
                  name: pendingToggle?.skill.name ?? '',
                  n: pendingToggle?.count ?? 0,
                },
              )
            }}
          </DialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="pendingToggle = null">
              {{ t('common.cancel') }}
            </Button>
            <Button size="sm" @click="confirmToggle">
              {{ pendingToggle?.enabled ? t('card.enableAction') : t('card.disableAction') }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
