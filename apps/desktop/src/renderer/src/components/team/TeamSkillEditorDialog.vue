<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TeamLibrarySkillDraft } from '../../../../shared/ipc.js'

const props = defineProps<{
  open: boolean
  initial?: TeamLibrarySkillDraft | null
  busy?: boolean
}>()
const emit = defineEmits<{
  close: []
  save: [value: TeamLibrarySkillDraft]
}>()
const { t } = useI18n()

const form = reactive<TeamLibrarySkillDraft>({
  name: '',
  description: '',
  version: '',
  tags: [],
  content: '',
})
const tagsText = shallowRef('')

function reset(): void {
  const initial = props.initial
  Object.assign(form, {
    originalPath: initial?.originalPath,
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    version: initial?.version ?? '',
    tags: [...(initial?.tags ?? [])],
    content: initial?.content ?? t('team.skillEditorDefaultContent'),
  })
  tagsText.value = form.tags.join(', ')
}

watch(() => [props.open, props.initial], () => {
  if (props.open) reset()
}, { immediate: true })

function submit(): void {
  emit('save', {
    ...form,
    version: form.version?.trim() || undefined,
    tags: tagsText.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
  })
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none">
        <div class="border-b px-5 py-4">
          <DialogTitle class="text-base font-semibold">{{ initial ? t('team.skillEditorEditTitle') : t('team.skillEditorCreateTitle') }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">
            {{ t('team.editorHint') }}
          </DialogDescription>
        </div>
        <form class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" @submit.prevent="submit">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formName') }}<Input v-model="form.name" placeholder="security-review" /></label>
            <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formVersion') }}<Input v-model="form.version" placeholder="1.0.0" /></label>
          </div>
          <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formDescription') }}<Input v-model="form.description" :placeholder="t('team.skillDescriptionPh')" /></label>
          <label class="grid gap-1.5 text-sm font-medium">
            {{ t('team.formTags') }}
            <Input v-model="tagsText" placeholder="security, review" />
          </label>
          <label class="grid gap-1.5 text-sm font-medium">
            {{ t('team.skillContent') }}
            <textarea
              v-model="form.content"
              rows="14"
              class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :placeholder="t('team.skillContentPh')"
            />
          </label>
        </form>
        <div class="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="ghost" size="sm" class="cursor-pointer" @click="emit('close')">{{ t('common.cancel') }}</Button>
          <Button type="button" size="sm" class="cursor-pointer" :disabled="busy || !form.name.trim() || !form.description.trim() || !form.content.trim()" @click="submit">
            {{ busy ? t('team.saving') : t('team.saveToChanges') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
