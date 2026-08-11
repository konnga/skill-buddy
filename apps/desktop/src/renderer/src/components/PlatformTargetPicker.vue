<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Select } from '@/components/ui/select'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const scope = defineModel<string>('scope', { default: 'user' })
const agents = defineModel<string[]>('agents', { default: () => [] })
defineProps<{ label?: string }>()

const { detectedPlatforms } = useSkills()
const { projectRoots, defaultInstallScope } = useSettings()
const { t } = useI18n()

// 「默认安装范围」为项目时，预选第一个项目目录（父组件传了具体值则不动）
onMounted(() => {
  if (
    scope.value === 'user' &&
    defaultInstallScope.value === 'project' &&
    projectRoots.value.length > 0
  ) {
    scope.value = projectRoots.value[0]!
  }
})

const available = computed(() =>
  detectedPlatforms.value.filter((p) => scope.value === 'user' || p.hasProjectScope),
)

const scopeOptions = computed(() => [
  { value: 'user', label: t('detail.userScope') },
  ...projectRoots.value.map((root) => ({
    value: root,
    label: t('detail.projectScope', { root }),
  })),
])

function toggle(id: string): void {
  agents.value = agents.value.includes(id)
    ? agents.value.filter((a) => a !== id)
    : [...agents.value, id]
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="label || projectRoots.length > 0" class="flex items-center justify-between gap-3">
      <span
        v-if="label"
        class="text-sm font-medium uppercase tracking-wide text-muted-foreground"
      >
        {{ label }}
      </span>
      <Select
        v-if="projectRoots.length > 0"
        v-model="scope"
        class="w-fit max-w-full"
        :options="scopeOptions"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="p in available"
        :key="p.id"
        type="button"
        :class="[
          'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
          agents.includes(p.id)
            ? 'border-foreground bg-foreground text-background'
            : 'hover:border-foreground/40',
        ]"
        @click="toggle(p.id)"
      >
        <PlatformIcon :id="p.id" :size="14" />
        {{ p.displayName }}
      </button>
    </div>
  </div>
</template>
