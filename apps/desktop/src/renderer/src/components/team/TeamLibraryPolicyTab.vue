<script setup lang="ts">
import { computed } from 'vue'
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
      组织规范适用于全员；团队规范由项目配置显式选择。每行填写一个资源引用，禁用规则可填写版本范围和原因。
    </p>
    <label class="grid gap-1.5 text-sm font-medium">
      规范范围
      <Select v-model="policyScope" :options="props.policyOptions" />
    </label>
    <div v-if="policyScope === '__new__'" class="grid gap-4 sm:grid-cols-2">
      <label class="grid gap-1.5 text-sm font-medium">
        团队 ID
        <Input v-model="newTeamId" placeholder="frontend" />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        团队名称
        <Input v-model="newTeamName" placeholder="前端团队" />
      </label>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="grid gap-1.5 text-sm font-medium">
        必装 Skills
        <textarea
          v-model="policy.requiredSkills"
          rows="5"
          placeholder="skills/code-review&#10;skills/security-review"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        必装 MCP
        <textarea
          v-model="policy.requiredMcp"
          rows="5"
          placeholder="mcp/company-docs.json"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        推荐 Skills
        <textarea
          v-model="policy.recommendedSkills"
          rows="5"
          placeholder="skills/frontend-testing"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        推荐 MCP
        <textarea
          v-model="policy.recommendedMcp"
          rows="5"
          placeholder="mcp/slack.json"
          class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
    </div>
    <label class="grid gap-1.5 text-sm font-medium">
      禁用规则
      <textarea
        v-model="policy.blocked"
        rows="5"
        placeholder="mcp/legacy-search.json | &lt;2.0.0 | 存在已知安全问题"
        class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
      />
    </label>
    <Button
      class="w-fit cursor-pointer"
      size="sm"
      :disabled="!canSave"
      @click="emit('save')"
    >
      保存规范到变更
    </Button>
  </section>
</template>
