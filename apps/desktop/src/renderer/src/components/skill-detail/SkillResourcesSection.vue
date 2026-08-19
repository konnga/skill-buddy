<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TriangleAlert } from '@lucide/vue'
import ResourcePreviewDialog from '@/components/ResourcePreviewDialog.vue'
import SkillResourceTree from '@/components/skill-detail/SkillResourceTree.vue'
import { ScrollArea } from '@/components/ui/scroll-area'

/** 资源区域持有预览弹窗状态，资源内容仍由详情页提供。 */
const props = defineProps<{
  skillName: string
  resources: [string, string][]
  containsScripts: boolean
}>()

const { t } = useI18n()
const previewTarget = shallowRef<{ path: string; source: string } | null>(null)

function previewResource(path: string, source: string): void {
  previewTarget.value = { path, source }
}

/** 技能切换时关闭旧资源预览，防止展示已不属于当前技能的文件。 */
watch(() => props.skillName, () => {
  previewTarget.value = null
})
</script>

<template>
  <section v-if="props.resources.length > 0" class="mb-8">
    <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
      {{ t('detail.resources') }}
    </h3>
    <div
      v-if="props.containsScripts"
      class="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
    >
      <TriangleAlert class="size-3.5 shrink-0" />
      {{ t('detail.scriptWarning') }}
    </div>
    <ScrollArea class="max-h-96" viewport-class="max-h-96 pr-2">
      <SkillResourceTree :resources="props.resources" @preview="previewResource" />
    </ScrollArea>
  </section>

  <ResourcePreviewDialog :resource="previewTarget" @close="previewTarget = null" />
</template>
