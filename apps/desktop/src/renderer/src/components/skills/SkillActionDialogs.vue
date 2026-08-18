<script setup lang="ts">
import { computed } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { agentLabel } from '@/lib/agents'
import type {
  BatchRequest,
  ToggleRequest,
  UninstallRequest,
} from '@/lib/skill-action-types'

/** 对话框层只展示请求快照并上抛确认事件，异步写入仍由页面业务层执行。 */
const props = defineProps<{
  pendingUninstall: UninstallRequest | null
  pendingToggle: ToggleRequest | null
  pendingBatch: BatchRequest | null
  batchProjectOpen: boolean
  batchProjectRoot: string
  batchProjectAgents: string[]
  projectOptions: { value: string; label: string }[]
  projectCapablePlatforms: { id: string; displayName: string }[]
  batchGroupOpen: boolean
  batchGroupNames: Set<string>
  groups: { name: string }[]
  selectedCount: number
  batchBusy: boolean
  removingNames: Set<string>
  togglingNames: Set<string>
}>()

const emit = defineEmits<{
  uninstallDialogChange: [open: boolean]
  confirmUninstall: []
  toggleDialogChange: [open: boolean]
  confirmToggle: []
  batchDialogChange: [open: boolean]
  confirmBatch: []
  'update:batchProjectOpen': [open: boolean]
  'update:batchProjectRoot': [root: string]
  toggleProjectAgent: [id: string]
  addSelectedToProject: []
  'update:batchGroupOpen': [open: boolean]
  toggleBatchGroup: [name: string]
  addSelectedToGroups: []
}>()

const { t } = useI18n()

const pendingUninstallCount = computed(() => props.pendingUninstall?.installations.length ?? 0)
const pendingUninstallIsScope = computed(
  () => Boolean(props.pendingUninstall?.projectFilter) && !props.pendingUninstall?.platformId,
)
const pendingUninstallIsScopeAgent = computed(
  () => Boolean(props.pendingUninstall?.projectFilter && props.pendingUninstall.platformId),
)
const pendingToggleCopy = computed(() => {
  const request = props.pendingToggle
  if (!request) return { title: '', descriptionKey: '', action: '' }
  const action = request.enabled ? 'enable' : 'disable'
  const context =
    request.context === 'agent'
      ? 'Agent'
      : request.context === 'scope'
        ? 'Scope'
        : request.context === 'scopeAgent'
          ? 'ScopeAgent'
          : 'Global'
  const key = `card.${action}${context}`
  return {
    title: t(`${key}Title`),
    descriptionKey: `${key}Confirm`,
    action: t(`${key}Action`),
  }
})
const pendingBatchTitle = computed(() =>
  props.pendingBatch ? t(`batch.${props.pendingBatch.action}Title`) : '',
)
const pendingBatchDescription = computed(() => {
  const request = props.pendingBatch
  if (!request) return ''
  const installations = request.items.reduce((count, item) => count + item.targets.length, 0)
  return t(`batch.${request.action}Confirm`, {
    skills: request.items.length,
    installations,
  })
})
const pendingBatchAction = computed(() =>
  props.pendingBatch ? t(`batch.${props.pendingBatch.action}Action`) : '',
)

const batchProjectOpenModel = computed({
  get: () => props.batchProjectOpen,
  set: (value: boolean) => emit('update:batchProjectOpen', value),
})
const batchProjectRootModel = computed({
  get: () => props.batchProjectRoot,
  set: (value: string) => emit('update:batchProjectRoot', value),
})
const batchGroupOpenModel = computed({
  get: () => props.batchGroupOpen,
  set: (value: boolean) => emit('update:batchGroupOpen', value),
})
</script>

<template>
  <DialogRoot
    :open="Boolean(props.pendingUninstall)"
    @update:open="emit('uninstallDialogChange', $event)"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none">
        <DialogTitle class="text-base font-semibold">
          {{
            pendingUninstallIsScope
              ? t('card.uninstallScopeTitle')
              : pendingUninstallIsScopeAgent
                ? t('card.uninstallScopeAgentTitle')
                : props.pendingUninstall?.platformId
                  ? t('card.uninstallCurrentTitle')
                  : t('card.uninstallAllTitle')
          }}
        </DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          <I18nT
            :keypath="
              pendingUninstallIsScope
                ? 'card.uninstallScopeConfirm'
                : pendingUninstallIsScopeAgent
                  ? 'card.uninstallScopeAgentConfirm'
                  : props.pendingUninstall?.platformId
                    ? 'card.uninstallCurrentConfirm'
                    : 'card.uninstallAllConfirm'
            "
            tag="span"
          >
            <template #name>
              <strong class="font-semibold text-foreground">{{ props.pendingUninstall?.skill.name }}</strong>
            </template>
            <template #platform>
              <strong class="font-semibold text-foreground">
                {{ props.pendingUninstall?.platformId ? agentLabel(props.pendingUninstall.platformId) : '' }}
              </strong>
            </template>
            <template #n>{{ pendingUninstallCount }}</template>
          </I18nT>
        </DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="Boolean(props.pendingUninstall && props.removingNames.has(props.pendingUninstall.skill.name))"
            @click="emit('uninstallDialogChange', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="cursor-pointer"
            :disabled="Boolean(props.pendingUninstall && props.removingNames.has(props.pendingUninstall.skill.name))"
            @click="emit('confirmUninstall')"
          >
            {{
              pendingUninstallIsScope
                ? t('card.uninstallScopeAction')
                : pendingUninstallIsScopeAgent
                  ? t('card.uninstallScopeAgentAction')
                  : props.pendingUninstall?.platformId
                    ? t('card.uninstallCurrentAction')
                    : t('card.uninstallAllAction')
            }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot :open="Boolean(props.pendingToggle)" @update:open="emit('toggleDialogChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none">
        <DialogTitle class="text-base font-semibold">{{ pendingToggleCopy.title }}</DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          <I18nT :keypath="pendingToggleCopy.descriptionKey" tag="span">
            <template #name><strong class="font-semibold text-foreground">{{ props.pendingToggle?.skill.name }}</strong></template>
            <template #platform><strong class="font-semibold text-foreground">{{ props.pendingToggle?.platformId ? agentLabel(props.pendingToggle.platformId) : '' }}</strong></template>
            <template #n>{{ props.pendingToggle?.installations.length ?? 0 }}</template>
          </I18nT>
        </DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="Boolean(props.pendingToggle && props.togglingNames.has(props.pendingToggle.skill.name))"
            @click="emit('toggleDialogChange', false)"
          >{{ t('common.cancel') }}</Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="Boolean(props.pendingToggle && props.togglingNames.has(props.pendingToggle.skill.name))"
            @click="emit('confirmToggle')"
          >{{ pendingToggleCopy.action }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot :open="Boolean(props.pendingBatch)" @update:open="emit('batchDialogChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none">
        <DialogTitle class="text-base font-semibold">{{ pendingBatchTitle }}</DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">{{ pendingBatchDescription }}</DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" :disabled="props.batchBusy" @click="emit('batchDialogChange', false)">{{ t('common.cancel') }}</Button>
          <Button :variant="props.pendingBatch?.action === 'uninstall' ? 'destructive' : 'default'" size="sm" class="cursor-pointer" :disabled="props.batchBusy" @click="emit('confirmBatch')">{{ pendingBatchAction }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot v-model:open="batchProjectOpenModel">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none">
        <DialogTitle class="text-base font-semibold">{{ t('batch.addProjectTitle') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('batch.addProjectHint', { n: props.selectedCount }) }}</DialogDescription>
        <div class="mt-4 flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{ t('batch.project') }}</span>
            <Select v-model="batchProjectRootModel" :options="props.projectOptions" />
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{ t('batch.agents') }}</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="platform in props.projectCapablePlatforms"
                :key="platform.id"
                type="button"
                :class="[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  props.batchProjectAgents.includes(platform.id)
                    ? 'border-foreground bg-foreground text-background'
                    : 'hover:border-foreground/40',
                ]"
                @click="emit('toggleProjectAgent', platform.id)"
              >
                <PlatformIcon :id="platform.id" :size="14" />
                {{ platform.displayName }}
              </button>
            </div>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" :disabled="props.batchBusy" @click="batchProjectOpenModel = false">{{ t('common.cancel') }}</Button>
          <Button size="sm" class="cursor-pointer" :disabled="props.batchBusy || !props.batchProjectRoot || props.batchProjectAgents.length === 0" @click="emit('addSelectedToProject')">{{ t('batch.addProjectAction') }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot v-model:open="batchGroupOpenModel">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none">
        <DialogTitle class="text-base font-semibold">{{ t('batch.addGroupsTitle') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('batch.addGroupsHint', { n: props.selectedCount }) }}</DialogDescription>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="group in props.groups"
            :key="group.name"
            type="button"
            :class="[
              'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
              props.batchGroupNames.has(group.name)
                ? 'border-foreground bg-foreground text-background'
                : 'hover:border-foreground/40',
            ]"
            @click="emit('toggleBatchGroup', group.name)"
          >
            {{ group.name }}
          </button>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="batchGroupOpenModel = false">{{ t('common.cancel') }}</Button>
          <Button size="sm" class="cursor-pointer" :disabled="props.batchGroupNames.size === 0" @click="emit('addSelectedToGroups')">{{ t('batch.addGroupsAction', { n: props.batchGroupNames.size }) }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
