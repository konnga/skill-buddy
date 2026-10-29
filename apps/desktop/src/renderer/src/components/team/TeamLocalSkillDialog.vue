<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { FolderInput, Sparkles, X } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{
  open: boolean
  busy: boolean
  error?: string | null
  /** 草稿里已有的 Skill 名称，用于标记「已在草稿」。 */
  existingNames: readonly string[]
}>()

const emit = defineEmits<{
  close: []
  select: [skill: AggregatedSkill]
}>()

const { t } = useI18n()
const { skills, refresh } = useSkills()
const keyword = ref('')
const scanning = ref(false)

/** 每次打开都重新扫描一次，避免本地新增的 Skill 在列表里缺席。 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    keyword.value = ''
    scanning.value = true
    void refresh({ silent: true }).finally(() => {
      scanning.value = false
    })
  },
)

const existing = computed(() => new Set(props.existingNames))

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return skills.value
    .filter(
      (skill) =>
        !query ||
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
})

/** 所有安装位置都被禁用时，导入后目录里没有可读的 SKILL.md。 */
function allDisabled(skill: AggregatedSkill): boolean {
  return skill.installations.every((item) => item.enabled === false)
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,88vh)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start gap-3 border-b px-5 py-4">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/25">
            <FolderInput class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <DialogTitle class="text-base font-semibold">{{ t('team.localSkillDialogTitle') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('team.localSkillDialogDescription') }}
            </DialogDescription>
          </span>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer"
            :title="t('common.close')"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X />
          </Button>
        </div>

        <div class="border-b px-5 py-3">
          <Input v-model="keyword" :placeholder="t('team.localSkillSearch')" class="h-8" />
        </div>

        <p v-if="props.error" class="border-b bg-destructive/5 px-5 py-3 text-sm text-destructive">
          {{ props.error }}
        </p>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="scanning && skills.length === 0" class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <LoadingSpinner />
            <span>{{ t('team.localSkillScanning') }}</span>
          </p>
          <p v-else-if="filtered.length === 0" class="py-16 text-center text-sm text-muted-foreground">
            {{ keyword.trim() ? t('team.localSkillNoMatch') : t('team.localSkillEmpty') }}
          </p>
          <ul v-else class="divide-y">
            <li v-for="skill in filtered" :key="skill.name">
              <button
                type="button"
                :disabled="props.busy || existing.has(skill.name) || allDisabled(skill)"
                class="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                @click="emit('select', skill)"
              >
                <Sparkles class="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">{{ skill.name }}</span>
                    <Badge v-if="skill.version" variant="secondary" class="shrink-0 font-mono text-[10px]">
                      v{{ skill.version }}
                    </Badge>
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ skill.description || skill.installations[0]?.path }}
                  </span>
                </span>
                <Badge v-if="existing.has(skill.name)" variant="outline" class="shrink-0">
                  {{ t('team.localSkillDuplicate') }}
                </Badge>
                <Badge v-else-if="allDisabled(skill)" variant="outline" class="shrink-0">
                  {{ t('team.localSkillDisabled') }}
                </Badge>
                <span v-else class="shrink-0 text-xs text-muted-foreground">
                  {{ t('team.localSkillInstallCount', { n: skill.installations.length }) }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
