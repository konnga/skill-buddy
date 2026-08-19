<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PackageX, Trash2 } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{ name: string }>()
const emit = defineEmits<{ remove: [] }>()
const { t } = useI18n()
</script>

<template>
  <Card class="flex h-full flex-col border-dashed bg-muted/10">
    <CardHeader class="gap-3 pb-3">
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <PackageX class="size-4 shrink-0 text-muted-foreground" />
          <CardTitle class="min-w-0 flex-1 truncate text-base leading-6" :title="props.name">
            {{ props.name }}
          </CardTitle>
        </div>
        <Badge variant="outline" class="shrink-0 text-muted-foreground">
          {{ t('groups.skillNotInstalled') }}
        </Badge>
      </div>
      <CardDescription class="min-h-10 leading-5">
        {{ t('groups.missingSkillDescription') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="mt-auto flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        class="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
        :title="t('groups.removeSkill')"
        @click="emit('remove')"
      >
        <Trash2 class="size-3.5" />
        {{ t('groups.removeSkill') }}
      </Button>
    </CardContent>
  </Card>
</template>
