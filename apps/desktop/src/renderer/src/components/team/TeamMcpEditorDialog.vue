<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { McpServerDefinition, McpTransportKind, McpValueRef } from '@skillbuddy/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { TeamLibraryMcpDraft } from '#shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type RemoteMcpTransportKind = Exclude<McpTransportKind, 'stdio'>

const props = defineProps<{ open: boolean; initial?: TeamLibraryMcpDraft | null; busy?: boolean }>()
const emit = defineEmits<{ close: []; save: [value: TeamLibraryMcpDraft] }>()
const { t } = useI18n()

const form = reactive({ name: '', description: '', version: '', command: '', cwd: '', url: '' })
const transport = shallowRef<McpTransportKind>('stdio')
const argsText = shallowRef('')
const referencesText = shallowRef('')
const secretsText = shallowRef('')

const transportOptions = [
  { value: 'stdio', label: 'stdio' },
  { value: 'streamable-http', label: 'Streamable HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'websocket', label: 'WebSocket' },
]
const valid = computed(() => Boolean(
  form.name.trim() &&
  form.description.trim() &&
  (transport.value === 'stdio' ? form.command.trim() : form.url.trim()),
))

function referenceLines(value: Record<string, McpValueRef>): string {
  return Object.entries(value).map(([key, reference]) =>
    `${key}=${reference.kind === 'env' ? reference.name : reference.kind === 'secret' ? reference.key : ''}`,
  ).join('\n')
}

function reset(): void {
  const definition = props.initial?.definition
  const kind: McpTransportKind = definition?.transport.kind ?? 'stdio'
  transport.value = kind
  const stdio = definition?.transport.kind === 'stdio' ? definition.transport : null
  const remote = definition && definition.transport.kind !== 'stdio' ? definition.transport : null
  Object.assign(form, {
    name: definition?.name ?? '',
    description: props.initial?.description ?? definition?.description ?? '',
    version: props.initial?.version ?? '',
    command: stdio?.command ?? '',
    cwd: stdio?.cwd ?? '',
    url: remote?.url ?? '',
  })
  argsText.value = (stdio?.args ?? []).join('\n')
  referencesText.value = kind === 'stdio'
    ? referenceLines(stdio?.env ?? {})
    : referenceLines(remote?.headers ?? {})
  secretsText.value = (definition?.requiredSecrets ?? []).join(', ')
}

watch(() => [props.open, props.initial], () => {
  if (props.open) reset()
}, { immediate: true })

function references(): Record<string, McpValueRef> {
  return Object.fromEntries(referencesText.value.split('\n').flatMap((line) => {
    const separator = line.indexOf('=')
    if (separator <= 0) return []
    const key = line.slice(0, separator).trim()
    const name = line.slice(separator + 1).trim()
    return key && name ? [[key, { kind: 'env' as const, name }]] : []
  }))
}

function submit(): void {
  if (!valid.value) return
  const requiredSecrets = [...new Set(secretsText.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean))]
  const shared = { name: form.name.trim(), description: form.description.trim(), requiredSecrets }
  const remoteTransport = transport.value as RemoteMcpTransportKind
  const definition: McpServerDefinition = transport.value === 'stdio'
    ? {
        ...shared,
        transport: {
          kind: 'stdio',
          command: form.command.trim(),
          args: argsText.value.split('\n').map((value) => value.trim()).filter(Boolean),
          ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
          env: references(),
        },
      }
    : {
        ...shared,
        transport: { kind: remoteTransport, url: form.url.trim(), headers: references() },
      }
  emit('save', {
    originalPath: props.initial?.originalPath,
    version: form.version.trim() || undefined,
    description: form.description.trim(),
    definition,
  })
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none">
        <div class="border-b px-5 py-4">
          <DialogTitle class="text-base font-semibold">{{ initial ? t('team.mcpEditorEditTitle') : t('team.mcpEditorCreateTitle') }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('team.mcpEditorHint') }}</DialogDescription>
        </div>
        <form class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" @submit.prevent="submit">
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formName') }}<Input v-model="form.name" placeholder="internal-docs" /></label>
            <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formVersion') }}<Input v-model="form.version" placeholder="1.0.0" /></label>
            <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formTransport') }}<Select v-model="transport" :options="transportOptions" /></label>
          </div>
          <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formDescription') }}<Input v-model="form.description" /></label>
          <template v-if="transport === 'stdio'">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formCommand') }}<Input v-model="form.command" placeholder="npx" /></label>
              <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formCwd') }}<Input v-model="form.cwd" /></label>
            </div>
            <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formArguments') }}<textarea v-model="argsText" rows="4" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label>
          </template>
          <label v-else class="grid gap-1.5 text-sm font-medium">{{ t('team.formEndpoint') }}<Input v-model="form.url" placeholder="https://example.com/mcp" /></label>
          <label class="grid gap-1.5 text-sm font-medium">
            {{ transport === 'stdio' ? t('team.formEnvironmentMap') : t('team.formHeaderMap') }}
            <textarea v-model="referencesText" rows="4" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="Authorization=INTERNAL_MCP_TOKEN" />
            <span class="text-xs font-normal text-muted-foreground">{{ t('team.formMappingHint') }}</span>
          </label>
          <label class="grid gap-1.5 text-sm font-medium">{{ t('team.formRequiredSecrets') }}<Input v-model="secretsText" placeholder="INTERNAL_MCP_TOKEN" /></label>
        </form>
        <div class="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('close')">{{ t('common.cancel') }}</Button>
          <Button size="sm" class="cursor-pointer" :disabled="busy || !valid" @click="submit">{{ busy ? t('team.saving') : t('team.saveToChanges') }}</Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
