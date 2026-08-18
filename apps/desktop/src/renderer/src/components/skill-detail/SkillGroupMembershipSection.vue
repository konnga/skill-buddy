<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@lucide/vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/composables/useSettings'

const props = defineProps<{ skillName: string }>()
const { t } = useI18n()
const { groups } = useSettings()

const memberGroups = computed(() =>
  groups.value.filter((group) => group.skills.includes(props.skillName)),
)
const availableGroups = computed(() =>
  groups.value.filter((group) => !group.skills.includes(props.skillName)),
)
const newGroupOpen = shallowRef(false)
const newGroupName = shallowRef('')
const duplicateName = computed(() => {
  const name = newGroupName.value.trim()
  return Boolean(name && groups.value.some((group) => group.name === name))
})

function openNewGroup(): void {
  newGroupName.value = ''
  newGroupOpen.value = true
}

function closeNewGroup(): void {
  newGroupOpen.value = false
  newGroupName.value = ''
}

/** 创建技能包时同时加入当前技能，避免产生没有成员的中间状态。 */
function createGroupWithSkill(): void {
  const name = newGroupName.value.trim()
  if (!name || duplicateName.value) return
  groups.value = [...groups.value, { name, skills: [props.skillName] }]
  closeNewGroup()
}

function toggleGroup(name: string): void {
  groups.value = groups.value.map((group) => {
    if (group.name !== name) return group
    return group.skills.includes(props.skillName)
      ? { ...group, skills: group.skills.filter((skillName) => skillName !== props.skillName) }
      : { ...group, skills: [...group.skills, props.skillName] }
  })
}

/** 技能切换后关闭旧技能的编辑草稿，避免误将其提交到新技能。 */
watch(() => props.skillName, closeNewGroup)
</script>

<template>
  <section class="mb-6">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium">{{ t('groups.membership') }}</h3>
      <button
        type="button"
        class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        @click.stop="openNewGroup"
      >
        <Plus class="size-3.5" />
        {{ t('groups.createTitle') }}
      </button>
    </div>
    <div class="rounded-lg border p-4">
      <div v-if="memberGroups.length > 0" class="flex flex-wrap gap-2">
        <button
          v-for="group in memberGroups"
          :key="group.name"
          type="button"
          class="cursor-pointer rounded-full border border-foreground bg-foreground px-2.5 py-0.5 text-sm text-background transition-colors hover:bg-foreground/85"
          @click="toggleGroup(group.name)"
        >
          {{ group.name }}
        </button>
      </div>
      <p v-else class="text-sm text-muted-foreground">{{ t('groups.noneAssigned') }}</p>
      <div v-if="availableGroups.length > 0" class="mt-3 border-t pt-3">
        <p class="mb-2 text-sm text-muted-foreground">{{ t('groups.available') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="group in availableGroups"
            :key="group.name"
            type="button"
            class="cursor-pointer rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            @click="toggleGroup(group.name)"
          >
            {{ group.name }}
          </button>
        </div>
      </div>
    </div>
  </section>

  <DialogRoot :open="newGroupOpen" @update:open="(open: boolean) => !open && closeNewGroup()">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="mb-4 text-base font-semibold tracking-tight">
          {{ t('groups.createTitle') }}
        </DialogTitle>
        <Input
          v-model="newGroupName"
          :placeholder="t('groups.createPh')"
          class="text-sm"
          autofocus
          @keydown.enter="createGroupWithSkill"
        />
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="closeNewGroup">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="!newGroupName.trim() || duplicateName"
            @click="createGroupWithSkill"
          >
            {{ t('common.add') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
