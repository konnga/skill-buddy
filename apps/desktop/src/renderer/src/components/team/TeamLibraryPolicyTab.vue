<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Boxes } from '@lucide/vue'
import type { SelectOption } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { TeamPolicyForm } from '@/composables/useTeamLibraryWorkspaceEditor'

const props = defineProps<{
  policyOptions: SelectOption[]
  busy: boolean
}>()
const emit = defineEmits<{ save: [] }>()
const { t } = useI18n()
const policy = defineModel<TeamPolicyForm>('policy', { required: true })
const policyScope = defineModel<string>('policyScope', { required: true })
const newTeamId = defineModel<string>('newTeamId', { required: true })
const newTeamName = defineModel<string>('newTeamName', { required: true })
const canSave = computed(
  () =>
    !props.busy &&
    (policyScope.value !== '__new__' ||
      (newTeamId.value.trim().length > 0 && newTeamName.value.trim().length > 0)),
)
</script>

<template>
  <section class="grid gap-4 rounded-md border px-4 py-4">
    <p class="text-sm text-muted-foreground">
      {{ t('team.policyHint') }}
    </p>
    <label class="grid gap-1.5 text-sm font-medium">
      {{ t('team.policyScope') }}
      <Select v-model="policyScope" :options="props.policyOptions" />
    </label>
    <div v-if="policyScope === '__new__'" class="grid gap-4 sm:grid-cols-2">
      <label class="grid gap-1.5 text-sm font-medium">
        {{ t('team.policyTeamId') }}
        <Input v-model="newTeamId" placeholder="frontend" />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        {{ t('team.policyTeamName') }}
        <Input v-model="newTeamName" :placeholder="t('team.policyTeamNamePh')" />
      </label>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="grid gap-1.5 text-sm font-medium">
        {{ t('team.policyRequiredSkills') }}
        <textarea
          v-model="policy.requiredSkills"
          rows="5"
          placeholder="skills/code-review&#10;skills/security-review"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        {{ t('team.policyRequiredMcp') }}
        <textarea
          v-model="policy.requiredMcp"
          rows="5"
          placeholder="mcp/company-docs.json"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        {{ t('team.policyRecommendedSkills') }}
        <textarea
          v-model="policy.recommendedSkills"
          rows="5"
          placeholder="skills/frontend-testing"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        {{ t('team.policyRecommendedMcp') }}
        <textarea
          v-model="policy.recommendedMcp"
          rows="5"
          placeholder="mcp/slack.json"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
    </div>
    <label class="grid gap-1.5 text-sm font-medium">
      {{ t('team.policyBlockedRules') }}
      <textarea
        v-model="policy.blocked"
        rows="5"
        :placeholder="t('team.policyBlockedRulesPh')"
        class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
      />
    </label>
    <Button
      class="w-fit cursor-pointer"
      size="sm"
      :disabled="!canSave"
      @click="emit('save')"
    >
      {{ t('team.policySave') }}
    </Button>
  </section>
</template>
