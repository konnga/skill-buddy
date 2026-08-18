<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUp, Hammer, Square } from '@lucide/vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { agentLabel } from '@/lib/agents'

const props = defineProps<{
  composer: string
  availableAgents: string[]
  selectedAgent: string
  agentsLoading: boolean
  conversationStarted: boolean
  running: boolean
}>()
const emit = defineEmits<{
  'update:composer': [value: string]
  'update:selectedAgent': [value: string]
  send: []
  cancel: []
}>()

const { t } = useI18n()
const agentOptions = computed(() =>
  props.availableAgents.map((id) => ({ value: id, label: agentLabel(id) })),
)
const composerModel = computed({
  get: () => props.composer,
  set: (value: string) => emit('update:composer', value),
})
const selectedAgentModel = computed({
  get: () => props.selectedAgent,
  set: (value: string) => emit('update:selectedAgent', value),
})

function onComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  emit('send')
}
</script>

<template>
  <footer class="shrink-0 bg-background px-6 pb-4 pt-2">
    <div
      class="mx-auto flex max-w-3xl flex-col rounded-[22px] border border-foreground/15 bg-background shadow-[0_8px_32px_rgb(0_0_0/0.08)] transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-[0_10px_36px_rgb(0_0_0/0.11)] dark:shadow-[0_8px_32px_rgb(0_0_0/0.28)]"
    >
      <div class="flex min-h-14 items-start gap-2 px-5 pb-1 pt-4">
        <span
          class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2 text-sm font-medium leading-none text-foreground/80"
        >
          <Hammer class="size-3.5" />
          skillbuddy-skill-creator
        </span>
        <textarea
          v-model="composerModel"
          rows="2"
          :placeholder="t('newSkill.chatPlaceholder')"
          class="min-h-10 min-w-0 flex-1 resize-none bg-transparent p-0 text-sm leading-6 outline-none placeholder:text-muted-foreground/45"
          :disabled="props.agentsLoading || props.availableAgents.length === 0"
          @keydown="onComposerKeydown"
        />
      </div>
      <div class="flex h-10 items-center px-4 pb-2">
        <Select
          v-if="props.selectedAgent"
          v-model="selectedAgentModel"
          class="inline-flex h-7 w-fit min-w-0 cursor-pointer self-center border-0 bg-transparent py-0 pl-2 pr-1.5 text-sm leading-none text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus-visible:ring-0"
          :options="agentOptions"
          :disabled="props.conversationStarted"
        >
          <template #value="{ option }">
            <span v-if="option" class="inline-flex h-full items-center gap-1.5">
              <PlatformIcon :id="option.value" :size="13" class="shrink-0" />
              <span class="leading-none">{{ option.label }}</span>
            </span>
          </template>
          <template #option="{ option }">
            <span class="flex items-center gap-2">
              <PlatformIcon :id="option.value" :size="14" class="shrink-0" />
              <span class="leading-none">{{ option.label }}</span>
            </span>
          </template>
        </Select>
        <div class="flex-1" />
        <Button
          v-if="props.running"
          size="icon"
          class="size-7 cursor-pointer rounded-full border-0 bg-foreground text-background hover:bg-foreground/90 hover:text-background"
          :title="t('newSkill.stop')"
          @click="emit('cancel')"
        >
          <Square class="size-3.5 fill-current" />
        </Button>
        <Button
          v-else
          size="icon"
          class="size-7 cursor-pointer rounded-full"
          :title="t('newSkill.send')"
          :disabled="!props.composer.trim() || !props.selectedAgent"
          @click="emit('send')"
        >
          <ArrowUp class="size-4" />
        </Button>
      </div>
    </div>
  </footer>
</template>
