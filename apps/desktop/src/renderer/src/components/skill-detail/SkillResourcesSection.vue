<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eye, FileText, TriangleAlert } from '@lucide/vue'
import ResourcePreviewDialog from '@/components/ResourcePreviewDialog.vue'
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
      <ul class="flex flex-col gap-1.5">
        <li v-for="[relativePath, absolutePath] in props.resources" :key="relativePath">
          <button
            type="button"
            class="group flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md border px-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/35"
            :aria-label="t('detail.previewResource', { name: relativePath })"
            :title="t('detail.previewResource', { name: relativePath })"
            @click="previewResource(relativePath, absolutePath)"
          >
            <FileText class="size-4 shrink-0 text-muted-foreground" />
            <code class="min-w-0 flex-1 select-text truncate text-sm">{{ relativePath }}</code>
            <Eye
              class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
          </button>
        </li>
      </ul>
    </ScrollArea>
  </section>

  <ResourcePreviewDialog :resource="previewTarget" @close="previewTarget = null" />
</template>
