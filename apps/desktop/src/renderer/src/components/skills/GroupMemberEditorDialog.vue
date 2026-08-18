<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Search } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** 成员编辑器接收页面生成的草稿集合，所有成员变更通过事件回传。 */
const props = defineProps<{
  open: boolean
  groupName: string | null
  search: string
  skills: AggregatedSkill[]
  missingNames: string[]
  draftMemberNames: Set<string>
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:search': [value: string]
  toggleMember: [name: string]
  save: []
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[min(680px,80vh)] w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-background p-5 shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="text-base font-semibold">
          {{ t('groups.manageSkillsTitle', { name: props.groupName }) }}
        </DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t('groups.manageSkillsHint') }}
        </DialogDescription>
        <div class="relative mt-4">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="props.search"
            :placeholder="t('groups.manageSkillsSearchPh')"
            class="pl-8"
            @update:model-value="emit('update:search', $event)"
          />
        </div>
        <div class="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border p-1">
          <label
            v-for="name in props.missingNames"
            :key="name"
            class="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <input
              type="checkbox"
              :checked="props.draftMemberNames.has(name)"
              class="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
              @change="emit('toggleMember', name)"
            />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ name }}</span>
              <span class="mt-0.5 block text-xs text-muted-foreground">
                {{ t('groups.skillNotInstalled') }}
              </span>
            </span>
          </label>
          <label
            v-for="skill in props.skills"
            :key="skill.name"
            class="flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
          >
            <input
              type="checkbox"
              :checked="props.draftMemberNames.has(skill.name)"
              class="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
              @change="emit('toggleMember', skill.name)"
            />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ skill.name }}</span>
              <span class="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                {{ skill.description }}
              </span>
            </span>
          </label>
          <p
            v-if="props.skills.length === 0 && props.missingNames.length === 0"
            class="px-3 py-10 text-center text-sm text-muted-foreground"
          >
            {{ t('groups.manageSkillsEmpty') }}
          </p>
        </div>
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">
            {{ t('groups.selectedSkills', { n: props.draftMemberNames.size }) }}
          </p>
          <div class="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="cursor-pointer"
              @click="emit('update:open', false)"
            >
              {{ t('common.cancel') }}
            </Button>
            <Button size="sm" class="cursor-pointer" @click="emit('save')">
              {{ t('groups.saveSkills') }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
