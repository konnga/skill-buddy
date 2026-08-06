<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import type { AggregatedSkill } from '@skills-manager/core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'

const props = defineProps<{ skill: AggregatedSkill }>()
defineEmits<{ open: [] }>()

const agents = computed(() => [...new Set(props.skill.installations.map((i) => i.agent))])
</script>

<template>
  <Card
    class="cursor-pointer transition-colors hover:border-foreground/25"
    @click="$emit('open')"
  >
    <CardHeader class="pb-3">
      <div class="flex items-start justify-between gap-2">
        <CardTitle class="text-sm">{{ skill.name }}</CardTitle>
        <Badge
          v-if="skill.hasDrift"
          variant="outline"
          class="shrink-0 gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
        >
          <TriangleAlert class="size-3" />
          漂移
        </Badge>
      </div>
      <CardDescription class="line-clamp-2 min-h-10">
        {{ skill.description || '（无描述）' }}
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
