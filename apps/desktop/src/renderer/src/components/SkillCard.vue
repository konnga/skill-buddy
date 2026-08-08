<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TriangleAlert } from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import CopyButton from '@/components/CopyButton.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'

const props = defineProps<{ skill: AggregatedSkill }>()
defineEmits<{ open: [] }>()
const { t } = useI18n()

const agents = computed(() => [...new Set(props.skill.installations.map((i) => i.agent))])
const hasProject = computed(() => props.skill.installations.some((i) => i.scope === 'project'))
const readOnly = computed(() => props.skill.installations.every((i) => i.readOnly))
</script>

<template>
  <Card
    class="group cursor-pointer transition-colors hover:border-foreground/25"
    @click="$emit('open')"
  >
    <CardHeader class="pb-3">
      <div class="flex items-start justify-between gap-2">
        <span class="flex min-w-0 items-center gap-1.5">
          <CardTitle class="select-text truncate text-base">{{ skill.name }}</CardTitle>
          <CopyButton
            :text="skill.name"
            class="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          <Badge v-if="readOnly" variant="secondary" class="text-[11px]">
            {{ t('card.readOnly') }}
          </Badge>
          <Badge v-if="hasProject" variant="secondary" class="text-[11px]">project</Badge>
          <Badge
            v-if="skill.hasDrift"
            variant="outline"
            class="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3" />
            {{ t('card.drift') }}
          </Badge>
        </span>
      </div>
      <CardDescription class="line-clamp-2 min-h-10">
        {{ skill.description || t('card.noDescription') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        v-for="agent in agents"
        :key="agent"
        class="flex items-center gap-1.5 text-xs text-muted-foreground"
        :title="agentLabel(agent)"
      >
        <PlatformIcon :id="agent" :size="14" />
        {{ agentLabel(agent) }}
      </span>
      <span v-if="skill.tags.length" class="text-border">·</span>
      <Badge v-for="tag in skill.tags" :key="tag" variant="outline" class="text-[11px]">
        {{ tag }}
      </Badge>
    </CardContent>
  </Card>
</template>
