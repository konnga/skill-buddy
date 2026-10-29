<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { Package, X } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSettings, type SkillGroup } from '@/composables/useSettings'

const props = defineProps<{
  open: boolean
  busy?: boolean
  /** 团队库草稿里已有的 Skill 名称，用来预估技能包里有多少能直接映射。 */
  availableNames: readonly string[]
}>()

const emit = defineEmits<{
  close: []
  select: [group: SkillGroup]
}>()

const { t } = useI18n()
const { groups } = useSettings()

const available = computed(
  () => new Set(props.availableNames.map((name) => name.toLowerCase())),
)

/** 技能包按 Skill 名称记录成员，团队库按目录路径引用，只能靠名称对上。 */
function matchedCount(group: SkillGroup): number {
  return group.skills.filter((name) => available.value.has(name.toLowerCase())).length
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[min(680px,88vh)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start gap-3 border-b px-5 py-4">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/25">
            <Package class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <DialogTitle class="text-base font-semibold">{{ t('team.localBundleDialogTitle') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('team.localBundleDialogDescription') }}
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

        <div class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="groups.length === 0" class="py-16 text-center text-sm text-muted-foreground">
            {{ t('team.localBundleEmpty') }}
          </p>
          <ul v-else class="divide-y">
            <li v-for="group in groups" :key="group.name">
              <button
                type="button"
                :disabled="props.busy || group.skills.length === 0"
                class="flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                @click="emit('select', group)"
              >
                <Package class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium">{{ group.name }}</span>
                    <Badge variant="secondary" class="shrink-0 text-[10px]">
                      {{ t('team.localBundleSkillCount', { n: group.skills.length }) }}
                    </Badge>
                  </span>
                  <span v-if="group.description" class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ group.description }}
                  </span>
                </span>
                <Badge v-if="group.skills.length === 0" variant="outline" class="mt-0.5 shrink-0">
                  {{ t('team.localBundleEmptyGroup') }}
                </Badge>
                <Badge v-else-if="matchedCount(group) === 0" variant="outline" class="mt-0.5 shrink-0">
                  {{ t('team.localBundleNoMatch') }}
                </Badge>
                <span v-else class="mt-0.5 shrink-0 text-xs text-muted-foreground">
                  {{ t('team.localBundleMatched', { matched: matchedCount(group), total: group.skills.length }) }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
