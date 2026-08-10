<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { Plus, Trash2, X } from '@lucide/vue'
import type {
  McpPlatformStatus,
  McpServerDefinition,
  McpTarget,
  McpValueRef,
} from '@skillbuddy/core'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'
import McpTargetPicker from './McpTargetPicker.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ReferenceRow {
  id: string
  key: string
  environment: string
}

const props = defineProps<{
  open: boolean
  platforms: McpPlatformStatus[]
  projectRoots: string[]
}>()
const emit = defineEmits<{
  close: []
  submit: [definition: McpServerDefinition, targets: McpTarget[]]
}>()
const { t } = useI18n()

const mode = shallowRef<'stdio' | 'http'>('stdio')
const form = reactive({ name: '', description: '', command: '', cwd: '', url: '' })
const argsText = shallowRef('')
const requiredText = shallowRef('')
const references = ref<ReferenceRow[]>([])
const targets = ref<McpTarget[]>([])
let nextReferenceId = 0

const urlValid = computed(() => {
  if (mode.value !== 'http') return true
  try {
    const parsed = new URL(form.url)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    )
  } catch {
    return false
  }
})

const valid = computed(
  () =>
    Boolean(form.name.trim()) &&
    (mode.value === 'stdio' ? Boolean(form.command.trim()) : urlValid.value) &&
    targets.value.length > 0 &&
    references.value.every((row) => Boolean(row.key.trim()) && Boolean(row.environment.trim())),
)

function reset(): void {
  mode.value = 'stdio'
  Object.assign(form, { name: '', description: '', command: '', cwd: '', url: '' })
  argsText.value = ''
  requiredText.value = ''
  references.value = []
  targets.value = []
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function addReference(): void {
  nextReferenceId += 1
  references.value.push({ id: `reference-${nextReferenceId}`, key: '', environment: '' })
}

function removeReference(index: number): void {
  references.value.splice(index, 1)
}

function referenceMap(): Record<string, McpValueRef> {
  return Object.fromEntries(
    references.value.map((row) => [
      row.key.trim(),
      { kind: 'env' as const, name: row.environment.trim() },
    ]),
  )
}

function submit(): void {
  if (!valid.value) return
  const requiredSecrets = new Set([
    ...references.value.map((row) => row.environment.trim()),
    ...requiredText.value
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean),
  ])
  const shared = {
    name: form.name.trim(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    requiredSecrets: [...requiredSecrets],
  }
  const definition: McpServerDefinition =
    mode.value === 'stdio'
      ? {
          ...shared,
          transport: {
            kind: 'stdio',
            command: form.command.trim(),
            args: argsText.value
              .split('\n')
              .map((argument) => argument.trim())
              .filter(Boolean),
            ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
            env: referenceMap(),
          },
        }
      : {
          ...shared,
          transport: {
            kind: 'streamable-http',
            url: form.url.trim(),
            headers: referenceMap(),
          },
        }
  emit('submit', definition, [...targets.value])
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start justify-between gap-4 border-b px-5 py-4">
          <span>
            <DialogTitle class="text-base font-semibold">{{ t('mcp.form.title') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('mcp.form.description') }}
            </DialogDescription>
          </span>
          <button
            type="button"
            class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="t('common.cancel')"
            :aria-label="t('common.cancel')"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <form class="min-h-0 flex-1 overflow-y-auto px-5 py-4" @submit.prevent="submit">
          <div class="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
            <button
              type="button"
              :class="[
                'rounded px-3 py-1.5 text-sm transition-colors',
                mode === 'stdio' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
              ]"
              @click="mode = 'stdio'"
            >
              stdio
            </button>
            <button
              type="button"
              :class="[
                'rounded px-3 py-1.5 text-sm transition-colors',
                mode === 'http' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
              ]"
              @click="mode = 'http'"
            >
              HTTP
            </button>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-sm font-medium">
              {{ t('mcp.form.name') }}
              <Input v-model="form.name" autocomplete="off" placeholder="filesystem" />
            </label>
            <label class="grid gap-1.5 text-sm font-medium">
              {{ t('mcp.form.descriptionLabel') }}
              <Input v-model="form.description" autocomplete="off" />
            </label>
          </div>

          <div v-if="mode === 'stdio'" class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-sm font-medium">
              {{ t('mcp.form.command') }}
              <Input v-model="form.command" autocomplete="off" placeholder="npx" />
            </label>
            <label class="grid gap-1.5 text-sm font-medium">
              {{ t('mcp.form.cwd') }}
              <Input v-model="form.cwd" autocomplete="off" />
            </label>
            <label class="grid gap-1.5 text-sm font-medium sm:col-span-2">
              {{ t('mcp.form.arguments') }}
              <textarea
                v-model="argsText"
                rows="3"
                class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="-y&#10;@modelcontextprotocol/server-filesystem"
              />
            </label>
          </div>

          <label v-else class="mt-4 grid gap-1.5 text-sm font-medium">
            {{ t('mcp.form.url') }}
            <Input v-model="form.url" autocomplete="off" placeholder="https://example.com/mcp" />
            <span v-if="form.url && !urlValid" class="text-xs font-normal text-destructive">
              {{ t('mcp.form.urlInvalid') }}
            </span>
          </label>

          <section class="mt-5">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-sm font-medium">
                {{ mode === 'stdio' ? t('mcp.form.environment') : t('mcp.form.headers') }}
              </h3>
              <button
                type="button"
                class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                :title="t('common.add')"
                :aria-label="t('common.add')"
                @click="addReference"
              >
                <Plus class="size-4" />
              </button>
            </div>
            <div v-if="references.length" class="space-y-2">
              <div v-for="(row, index) in references" :key="row.id" class="flex gap-2">
                <Input v-model="row.key" :placeholder="mode === 'stdio' ? 'KEY' : 'Authorization'" />
                <Input v-model="row.environment" placeholder="ENV_NAME" />
                <button
                  type="button"
                  class="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  :title="t('common.delete')"
                  :aria-label="t('common.delete')"
                  @click="removeReference(index)"
                >
                  <Trash2 class="size-4" />
                </button>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground">{{ t('mcp.form.noReferences') }}</p>
          </section>

          <label class="mt-5 grid gap-1.5 text-sm font-medium">
            {{ t('mcp.form.requiredSecrets') }}
            <Input v-model="requiredText" autocomplete="off" placeholder="GITHUB_TOKEN, DATABASE_URL" />
          </label>

          <section class="mt-5">
            <h3 class="mb-2 text-sm font-medium">{{ t('mcp.form.targets') }}</h3>
            <McpTargetPicker
              v-model="targets"
              :platforms="platforms"
              :project-roots="projectRoots"
            />
          </section>
        </form>

        <div class="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" size="sm" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button size="sm" :disabled="!valid" @click="submit">
            {{ t('mcp.form.review') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
