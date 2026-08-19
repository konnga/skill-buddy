<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  shallowRef,
  toRef,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Pencil } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import CopyButton from '@/components/CopyButton.vue'
import MarkdownView from '@/components/AsyncMarkdownView.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import SkillDriftSection from '@/components/skill-detail/SkillDriftSection.vue'
import SkillGroupMembershipSection from '@/components/skill-detail/SkillGroupMembershipSection.vue'
import SkillInstallPanel from '@/components/skill-detail/SkillInstallPanel.vue'
import SkillInstallationsSection from '@/components/skill-detail/SkillInstallationsSection.vue'
import SkillResourcesSection from '@/components/skill-detail/SkillResourcesSection.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkillDetailActions } from '@/composables/useSkillDetailActions'
import type { SkillFocus } from '@/lib/navigation'
import { hasScriptResources } from '@/lib/resources'

const SkillEditor = defineAsyncComponent(() => import('@/components/SkillEditor.vue'))

const props = defineProps<{
  skill: AggregatedSkill
  inset?: boolean
  focus?: SkillFocus
  initialMode?: 'view' | 'edit'
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const mode = shallowRef<'view' | 'edit'>(props.initialMode ?? 'view')

const {
  targets,
  busy,
  actionError,
  writableInstallations,
  installedTargets,
  baseInstallation,
  driftOthers,
  writableDriftOthers,
  setTargets,
  selectBase,
  reveal,
  runInstall,
  syncFromBase,
  removeInstallation,
  toggleInstallation,
} = useSkillDetailActions({
  skill: toRef(props, 'skill'),
  onClose: () => emit('close'),
})

const primaryInstallation = computed(
  () => writableInstallations.value[0] ?? props.skill.installations[0]!,
)
const canEdit = computed(() => writableInstallations.value.length > 0)
const skillContent = computed(() => primaryInstallation.value.skill.content)
const resources = computed(() => primaryInstallation.value.skill.resources ?? {})
const resourceList = computed(() => Object.entries(resources.value))
const containsScripts = computed(() => hasScriptResources(resources.value))

const driftSection = useTemplateRef<HTMLElement>('driftSection')
const installSection = useTemplateRef<HTMLElement>('installSection')

/** 从注意事项入口进入详情时，将对应操作区域滚动到可见位置并建立键盘焦点。 */
function focusSection(): void {
  if (!props.focus) return
  const target = props.focus === 'drift' ? driftSection.value : installSection.value
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

onMounted(() => void nextTick(focusSection))
watch(() => props.focus, () => void nextTick(focusSection))
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag cursor-pointer"
        @click="emit('close')"
      >
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <div class="flex h-9 min-w-0 items-center gap-2">
        <h1 class="select-text truncate text-base font-semibold leading-5 tracking-tight">
          {{ skill.name }}
        </h1>
        <CopyButton :text="skill.name" class="app-no-drag" />
        <Badge v-if="skill.version" variant="outline">v{{ skill.version }}</Badge>
        <Badge v-for="tag in skill.tags" :key="tag" variant="outline">{{ tag }}</Badge>
      </div>
      <div class="flex-1" />
      <Button
        v-if="mode === 'view' && canEdit"
        variant="outline"
        size="sm"
        class="app-no-drag cursor-pointer"
        @click="mode = 'edit'"
      >
        <Pencil />
        {{ t('common.edit') }}
      </Button>
    </header>

    <!-- edit mode -->
    <ScrollArea v-if="mode === 'edit'" class="flex-1">
      <div class="mx-auto max-w-3xl">
        <SkillEditor :skill="skill" @done="mode = 'view'" @cancel="mode = 'view'" />
      </div>
    </ScrollArea>

    <!-- view mode -->
    <ScrollArea v-else class="flex-1">
      <div class="mx-auto max-w-3xl px-6 py-6">
        <p class="mb-4 text-sm text-muted-foreground">
          {{ skill.description || t('card.noDescription') }}
        </p>

        <SkillGroupMembershipSection v-if="!props.focus" :skill-name="skill.name" />

        <SkillInstallationsSection
          :installations="skill.installations"
          :busy="busy"
          @reveal="reveal"
          @remove="removeInstallation"
          @toggle="toggleInstallation"
        />
        <div
          v-if="skill.hasDrift"
          ref="driftSection"
          tabindex="-1"
          :class="[
            'mb-8 scroll-mt-6 outline-none transition-colors',
            props.focus === 'drift' && 'border-l-2 border-amber-500 pl-4',
          ]"
        >
          <SkillDriftSection
            :installations="skill.installations"
            :base-installation="baseInstallation"
            :drift-others="driftOthers"
            :writable-drift-others="writableDriftOthers"
            :busy="busy"
            @select-base="selectBase"
            @sync="syncFromBase"
          />
        </div>

        <div
          ref="installSection"
          tabindex="-1"
          :class="[
            'mb-8 scroll-mt-6 outline-none transition-colors',
            props.focus === 'install' && 'border-l-2 border-foreground/30 pl-4',
          ]"
        >
          <SkillInstallPanel
            :targets="targets"
            :installed-targets="installedTargets"
            :busy="busy"
            :error="actionError"
            @update:targets="setTargets"
            @install="runInstall"
          />
        </div>

        <SkillResourcesSection
          :skill-name="skill.name"
          :resources="resourceList"
          :contains-scripts="containsScripts"
        />
        <!-- content -->
        <section class="mb-8">
          <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            SKILL.md
          </h3>
          <MarkdownView :content="skillContent" preview-id="skill-detail" class="select-text" />
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
