<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Blocks, FolderOpen, RefreshCw } from '@lucide/vue'
import type { InstalledSkill } from '@skills-manager/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const skills = ref<InstalledSkill[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    skills.value = await window.skillsManager.scanSkills()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const byAgent = computed(() => {
  const groups = new Map<string, InstalledSkill[]>()
  for (const item of skills.value) {
    const list = groups.get(item.agent) ?? []
    list.push(item)
    groups.set(item.agent, list)
  }
  return groups
})

onMounted(refresh)
</script>

<template>
  <div class="min-h-screen">
    <header
      class="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur"
    >
      <div class="flex items-center gap-2.5">
        <Blocks class="size-5 text-primary" />
        <h1 class="text-base font-semibold tracking-tight">Skills Manager</h1>
      </div>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
        <RefreshCw :class="loading ? 'animate-spin' : ''" />
        重新扫描
      </Button>
    </header>

    <main class="mx-auto max-w-4xl px-6 py-8">
      <div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">扫描中…</div>

      <div v-else-if="error" class="py-16 text-center text-sm text-destructive">{{ error }}</div>

      <div
        v-else-if="skills.length === 0"
        class="flex flex-col items-center gap-3 py-16 text-muted-foreground"
      >
        <FolderOpen class="size-10" />
        <p class="text-sm">未发现已安装的 skills</p>
      </div>

      <div v-else class="flex flex-col gap-8">
        <section v-for="[agent, items] in byAgent" :key="agent">
          <div class="mb-3 flex items-center gap-2">
            <h2 class="text-sm font-medium text-muted-foreground">{{ agent }}</h2>
            <Badge variant="secondary">{{ items.length }}</Badge>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card
              v-for="item in items"
              :key="item.path"
              class="transition-colors hover:border-primary/40"
            >
              <CardHeader>
                <div class="flex items-center justify-between gap-2">
                  <CardTitle class="text-sm">{{ item.skill.name }}</CardTitle>
                  <Badge :variant="item.scope === 'user' ? 'default' : 'success'">
                    {{ item.scope }}
                  </Badge>
                </div>
                <CardDescription class="line-clamp-2">
                  {{ item.skill.description || '（无描述）' }}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <code class="break-all text-xs text-muted-foreground/70">{{ item.path }}</code>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
