<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { LoaderCircle, Sparkles, Terminal } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import MarkdownView from '@/components/MarkdownView.vue'
import type { ChatMessage } from '@/composables/useSkillCreationConversation'

const props = defineProps<{
  messages: ChatMessage[]
  skill?: AggregatedSkill
  agentsLoading: boolean
  hasAgents: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="props.messages.length === 0"
    class="flex flex-1 flex-col items-center justify-center pb-20 text-center"
  >
    <div class="mb-4 flex size-10 items-center justify-center rounded-lg border bg-muted/30">
      <Sparkles class="size-5" />
    </div>
    <h2 class="text-base font-semibold">
      {{ props.skill ? t('newSkill.emptyEditTitle') : t('newSkill.emptyTitle') }}
    </h2>
    <p class="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
      {{ props.skill ? t('newSkill.emptyEditHint') : t('newSkill.emptyHint') }}
    </p>
    <p
      v-if="!props.agentsLoading && !props.hasAgents"
      class="mt-4 text-sm text-destructive"
    >
      {{ t('newSkill.noAgent') }}
    </p>
  </div>

  <div v-else class="flex flex-col gap-8">
    <template v-for="message in props.messages" :key="message.id">
      <div v-if="message.role === 'user'" class="flex justify-end">
        <div
          class="max-w-[82%] whitespace-pre-wrap rounded-lg bg-muted px-4 py-2.5 text-sm leading-6"
        >
          {{ message.text }}
        </div>
      </div>

      <article v-else class="min-w-0">
        <MarkdownView
          v-if="message.text"
          :content="message.text"
          :preview-id="`ai-message-${message.id}`"
        />
        <div v-if="message.activities.length > 0" class="mt-3 flex flex-col gap-1.5">
          <div
            v-for="(activity, index) in message.activities"
            :key="`${activity}-${index}`"
            class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
          >
            <Terminal class="size-3.5 shrink-0" />
            <span class="truncate font-mono">{{ activity }}</span>
          </div>
        </div>
        <div
          v-if="message.streaming"
          class="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle class="size-3.5 animate-spin" />
          {{ t('newSkill.thinking') }}
        </div>
        <p v-if="message.error" class="mt-3 break-all text-sm text-destructive">
          {{ message.error }}
        </p>
      </article>
    </template>
  </div>
</template>
