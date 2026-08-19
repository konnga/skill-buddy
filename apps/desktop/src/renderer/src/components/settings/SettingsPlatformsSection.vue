<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Plus, Trash2 } from '@lucide/vue'
import type { PlatformStatus } from '@skillbuddy/core'
import type { CustomPlatformInput } from '#shared/ipc'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface CustomPlatformForm {
  id: string
  displayName: string
  userSkillsDir: string
  projectSkillsDir: string
  detectPath: string
}

/** 平台区域只负责表单和平台列表展示，保存、同步与刷新仍由设置页处理。 */
const props = defineProps<{
  platforms: PlatformStatus[]
  customPlatforms: CustomPlatformInput[]
  showForm: boolean
  form: CustomPlatformForm
  formError: string | null
}>()

const emit = defineEmits<{
  'update:showForm': [value: boolean]
  'update:form': [value: CustomPlatformForm]
  add: []
  remove: [id: string]
}>()

const { t } = useI18n()

function updateField<K extends keyof CustomPlatformForm>(field: K, value: string): void {
  emit('update:form', { ...props.form, [field]: value })
}
</script>

<template>
  <section class="mb-10">
    <div class="mb-3 flex items-center justify-between gap-6">
      <h2 class="text-sm font-medium">{{ t('settings.sectionPlatforms') }}</h2>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        @click="emit('update:showForm', !props.showForm)"
      >
        <Plus />
        {{ t('settings.customPlatform') }}
      </Button>
    </div>
    <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.platformsDesc') }}</p>

    <div v-if="props.showForm" class="mb-3 flex flex-col gap-2 rounded-xl border px-5 py-4">
      <div class="grid grid-cols-2 gap-2">
        <Input
          :model-value="props.form.id"
          :placeholder="t('settings.formIdPh')"
          class="text-sm"
          @update:model-value="updateField('id', $event)"
        />
        <Input
          :model-value="props.form.displayName"
          :placeholder="t('settings.formNamePh')"
          class="text-sm"
          @update:model-value="updateField('displayName', $event)"
        />
      </div>
      <Input
        :model-value="props.form.detectPath"
        :placeholder="t('settings.formDetectPh')"
        class="text-sm"
        @update:model-value="updateField('detectPath', $event)"
      />
      <Input
        :model-value="props.form.userSkillsDir"
        :placeholder="t('settings.formUserDirPh')"
        class="text-sm"
        @update:model-value="updateField('userSkillsDir', $event)"
      />
      <Input
        :model-value="props.form.projectSkillsDir"
        :placeholder="t('settings.formProjectDirPh')"
        class="text-sm"
        @update:model-value="updateField('projectSkillsDir', $event)"
      />
      <p v-if="props.formError" class="text-sm text-destructive">{{ props.formError }}</p>
      <div class="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="cursor-pointer"
          @click="emit('update:showForm', false)"
        >
          {{ t('common.cancel') }}
        </Button>
        <Button size="sm" class="cursor-pointer" @click="emit('add')">
          {{ t('common.add') }}
        </Button>
      </div>
    </div>

    <div class="divide-y rounded-xl border">
      <div
        v-for="platform in props.platforms"
        :key="platform.id"
        class="flex items-center justify-between gap-2 px-5 py-3"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <PlatformIcon :id="platform.id" :size="16" />
          <span class="text-sm">{{ platform.displayName }}</span>
          <Badge :variant="platform.detected ? 'success' : 'secondary'">
            {{ platform.detected ? t('settings.detected') : t('settings.notDetected') }}
          </Badge>
        </div>
        <Button
          v-if="props.customPlatforms.some((custom) => custom.id === platform.id)"
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 cursor-pointer text-muted-foreground"
          :title="t('settings.removeNote')"
          :aria-label="t('settings.removeNote')"
          @click="emit('remove', platform.id)"
        >
          <Trash2 class="size-3.5" />
        </Button>
      </div>
    </div>
  </section>
</template>
