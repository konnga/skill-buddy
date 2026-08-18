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
import type { ToggleRequest } from '@/lib/skill-action-types'

const props = defineProps<{
  request: ToggleRequest | null
  togglingNames: Set<string>
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
  confirm: []
}>()

const { t } = useI18n()

const copy = computed(() => {
  const request = props.request
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
const isBusy = computed(() =>
  Boolean(props.request && props.togglingNames.has(props.request.skill.name)),
)
</script>

<template>
  <DialogRoot :open="Boolean(props.request)" @update:open="emit('openChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ copy.title }}</DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          <I18nT :keypath="copy.descriptionKey" tag="span">
            <template #name>
              <strong class="font-semibold text-foreground">{{ props.request?.skill.name }}</strong>
            </template>
            <template #platform>
              <strong class="font-semibold text-foreground">
                {{ props.request?.platformId ? agentLabel(props.request.platformId) : '' }}
              </strong>
            </template>
            <template #n>{{ props.request?.installations.length ?? 0 }}</template>
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
            size="sm"
            class="cursor-pointer"
            :disabled="isBusy"
            @click="emit('confirm')"
          >
            {{ copy.action }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
