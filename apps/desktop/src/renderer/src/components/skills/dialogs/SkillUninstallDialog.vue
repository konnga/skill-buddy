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
import { Button } from '@/components/ui/button'
import { agentLabel } from '@/lib/agents'
import type { UninstallRequest } from '@/lib/skill-action-types'

const props = defineProps<{
  request: UninstallRequest | null
  removingNames: Set<string>
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
  confirm: []
}>()

const { t } = useI18n()

const installationCount = computed(() => props.request?.installations.length ?? 0)
const isScope = computed(() => Boolean(props.request?.projectFilter) && !props.request?.platformId)
const isScopeAgent = computed(() =>
  Boolean(props.request?.projectFilter && props.request.platformId),
)
const isBusy = computed(() =>
  Boolean(props.request && props.removingNames.has(props.request.skill.name)),
)
const title = computed(() =>
  isScope.value
    ? t('card.uninstallScopeTitle')
    : isScopeAgent.value
      ? t('card.uninstallScopeAgentTitle')
      : props.request?.platformId
        ? t('card.uninstallCurrentTitle')
        : t('card.uninstallAllTitle'),
)
const descriptionKey = computed(() =>
  isScope.value
    ? 'card.uninstallScopeConfirm'
    : isScopeAgent.value
      ? 'card.uninstallScopeAgentConfirm'
      : props.request?.platformId
        ? 'card.uninstallCurrentConfirm'
        : 'card.uninstallAllConfirm',
)
const action = computed(() =>
  isScope.value
    ? t('card.uninstallScopeAction')
    : isScopeAgent.value
      ? t('card.uninstallScopeAgentAction')
      : props.request?.platformId
        ? t('card.uninstallCurrentAction')
        : t('card.uninstallAllAction'),
)
</script>

<template>
  <DialogRoot :open="Boolean(props.request)" @update:open="emit('openChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          <I18nT :keypath="descriptionKey" tag="span">
            <template #name>
              <strong class="font-semibold text-foreground">{{ props.request?.skill.name }}</strong>
            </template>
            <template #platform>
              <strong class="font-semibold text-foreground">
                {{ props.request?.platformId ? agentLabel(props.request.platformId) : '' }}
              </strong>
            </template>
            <template #n>{{ installationCount }}</template>
          </I18nT>
        </DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="isBusy"
            @click="emit('openChange', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="cursor-pointer"
            :disabled="isBusy"
            @click="emit('confirm')"
          >
            {{ action }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
