<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import SkillArtifactPanel from '@/components/new-skill/SkillArtifactPanel.vue'
import SkillConversationComposer from '@/components/new-skill/SkillConversationComposer.vue'
import SkillConversationMessages from '@/components/new-skill/SkillConversationMessages.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { useSkillArtifactInstallation } from '@/composables/useSkillArtifactInstallation'
import { useSkillCreationConversation } from '@/composables/useSkillCreationConversation'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ inset?: boolean; skill?: AggregatedSkill }>()
const emit = defineEmits<{ close: [] }>()

const { detectedPlatforms, installSkill, skills } = useSkills()
const { t } = useI18n()
const scrollElement = useTemplateRef<HTMLElement>('scrollElement')

function scrollToBottom(): void {
  void nextTick(() => {
    const element = scrollElement.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

const {
  agentsLoading,
  availableAgents,
  selectedAgent,
  conversationStarted,
  nativeSessionId,
  messages,
  composer,
  running,
  artifact,
  setComposer,
  setSelectedAgent,
  sendMessage,
  cancelGeneration,
} = useSkillCreationConversation({
  skill: props.skill,
  skills,
  detectedPlatforms,
  onContentChange: scrollToBottom,
})

const {
  targets,
  installing,
  installError,
  artifactInstalled,
  setTargets,
  installArtifact,
} = useSkillArtifactInstallation({ artifact, detectedPlatforms, installSkill })
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <Button
        variant="ghost"
        size="icon"
        class="app-no-drag cursor-pointer"
        :title="t('common.cancel')"
        @click="emit('close')"
      >
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <div class="flex h-9 min-w-0 flex-col justify-center">
        <h1 class="truncate text-sm font-semibold leading-5">
          {{
            props.skill
              ? t('newSkill.chatEditTitle', { name: props.skill.name })
              : t('newSkill.chatTitle')
          }}
        </h1>
        <p v-if="nativeSessionId" class="truncate text-[11px] leading-4 text-muted-foreground">
          {{ t('newSkill.sessionActive') }}
        </p>
      </div>
      <div class="flex-1" />
    </header>

    <div ref="scrollElement" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 pb-8 pt-7">
        <SkillConversationMessages
          :messages="messages"
          :skill="props.skill"
          :agents-loading="agentsLoading"
          :has-agents="availableAgents.length > 0"
        />
        <SkillArtifactPanel
          v-if="artifact"
          :artifact="artifact"
          :targets="targets"
          :installing="installing"
          :install-error="installError"
          :installed="artifactInstalled"
          @update:targets="setTargets"
          @install="installArtifact"
        />
      </div>
    </div>

    <SkillConversationComposer
      :composer="composer"
      :available-agents="availableAgents"
      :selected-agent="selectedAgent"
      :agents-loading="agentsLoading"
      :conversation-started="conversationStarted"
      :running="running"
      @update:composer="setComposer"
      @update:selected-agent="setSelectedAgent"
      @send="sendMessage"
      @cancel="cancelGeneration"
    />
  </div>
</template>
