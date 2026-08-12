<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Power, PowerOff } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GroupRuntimeState } from '@/lib/group-runtime'

const props = defineProps<{
  state: GroupRuntimeState
  busy?: boolean
}>()

const emit = defineEmits<{
  enable: []
  disable: []
}>()

const { t } = useI18n()
const statusVariant = computed(() => {
  if (props.state.status === 'enabled') return 'success' as const
  if (props.state.status === 'partial') return 'default' as const
  return 'secondary' as const
})
const cannotManage = computed(
  () => props.busy || props.state.manageableInstallations === 0,
)
</script>

<template>
  <section class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
    <div class="min-w-0 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="truncate text-sm font-medium" :title="state.name">{{ state.name }}</h2>
        <Badge :variant="statusVariant" class="text-xs">
          {{ t(`groups.status.${state.status}`) }}
        </Badge>
      </div>
      <p class="text-xs text-muted-foreground">
        {{
          t('groups.runtimeProgress', {
            installed: state.installedSkills,
            total: state.totalSkills,
            enabled: state.enabledInstallations,
            disabled: state.disabledInstallations,
          })
        }}
      </p>
      <p
        v-if="state.missingSkills.length > 0"
        class="max-w-2xl truncate text-xs text-amber-600 dark:text-amber-400"
        :title="state.missingSkills.join(', ')"
      >
        {{ t('groups.runtimeMissing', { names: state.missingSkills.join(', ') }) }}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="cannotManage || state.status === 'enabled'"
        @click="emit('enable')"
      >
        <Power class="size-3.5" />
        {{ t('groups.enableGroup') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="cannotManage || state.status === 'disabled'"
        @click="emit('disable')"
      >
        <PowerOff class="size-3.5" />
        {{ t('groups.disableGroup') }}
      </Button>
    </div>
  </section>
</template>
