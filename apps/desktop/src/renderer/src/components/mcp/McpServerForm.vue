<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { ClipboardPaste, Plus, Trash2, X } from '@lucide/vue'
import type {
  McpPlatformStatus,
  McpServerDefinition,
  McpTarget,
  McpTransportKind,
  McpValueRef,
} from '@skillbuddy/core'
import {
  McpImportError,
  parseMcpServerConfig,
  SENSITIVE_MCP_URL_KEY,
  type McpImportCandidate,
  type McpImportWarning,
} from '@skillbuddy/core/mcp-config'
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
import { useMcpArguments } from '@/composables/useMcpArguments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'

interface ReferenceRow {
  id: string
  key: string
  environment: string
}

type RemoteKind = Exclude<McpTransportKind, 'stdio'>

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
const remoteKind = shallowRef<RemoteKind>('streamable-http')
const form = reactive({ name: '', description: '', command: '', cwd: '', url: '' })
const { argsText, args: parsedArgs, asJson: argsAsJson, setArguments, resetArguments } =
  useMcpArguments()
const requiredText = shallowRef('')
const references = ref<ReferenceRow[]>([])
const targets = ref<McpTarget[]>([])
let nextReferenceId = 0

const importOpen = shallowRef(false)
const importText = shallowRef('')
const importCandidates = ref<McpImportCandidate[]>([])
const importWarnings = ref<McpImportWarning[]>([])
const importError = shallowRef<string | null>(null)

/** JSON 示例跨语言一致，不放进 locale 文案，避免大括号被 vue-i18n 当成插值。 */
const importPlaceholder = `{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "fetch-mcp"]
    }
  }
}`

const transportOptions: SelectOption[] = [
  { value: 'streamable-http', label: 'Streamable HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'websocket', label: 'WebSocket' },
]

/** Select 只产出 string，这里收敛回受支持的远程传输类型。 */
const remoteTransport = computed({
  get: (): string => remoteKind.value,
  set: (value: string) => {
    if (value === 'streamable-http' || value === 'sse' || value === 'websocket') {
      remoteKind.value = value
    }
  },
})

const argsPlaceholder = computed(() =>
  argsAsJson.value
    ? '["-y", "@modelcontextprotocol/server-filesystem"]'
    : '-y\n@modelcontextprotocol/server-filesystem',
)

const urlValid = computed(() => {
  if (mode.value !== 'http') return true
  try {
    const parsed = new URL(form.url)
    const protocols =
      remoteKind.value === 'websocket'
        ? ['ws:', 'wss:', 'http:', 'https:']
        : ['http:', 'https:']
    if (!protocols.includes(parsed.protocol)) return false
    if (parsed.username || parsed.password || parsed.hash) return false
    for (const [key, value] of parsed.searchParams) {
      if (SENSITIVE_MCP_URL_KEY.test(key) && value) return false
    }
    return true
  } catch {
    return false
  }
})

const valid = computed(
  () =>
    Boolean(form.name.trim()) &&
    (mode.value === 'stdio'
      ? Boolean(form.command.trim()) && parsedArgs.value !== null
      : urlValid.value) &&
    targets.value.length > 0 &&
    references.value.every((row) => Boolean(row.key.trim()) && Boolean(row.environment.trim())),
)

function reset(): void {
  mode.value = 'stdio'
  remoteKind.value = 'streamable-http'
  Object.assign(form, { name: '', description: '', command: '', cwd: '', url: '' })
  resetArguments()
  requiredText.value = ''
  references.value = []
  targets.value = []
  closeImport()
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
            args: parsedArgs.value ?? [],
            ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
            env: referenceMap(),
          },
        }
      : {
          ...shared,
          transport: {
            kind: remoteKind.value,
            url: form.url.trim(),
            headers: referenceMap(),
          },
        }
  emit('submit', definition, [...targets.value])
}

function closeImport(): void {
  importOpen.value = false
  importText.value = ''
  importCandidates.value = []
  importWarnings.value = []
  importError.value = null
}

function openImport(): void {
  importOpen.value = true
  importError.value = null
}

function importErrorMessage(error: unknown): string {
  if (error instanceof McpImportError) {
    if (error.code === 'MCP_IMPORT_PARSE_FAILED') {
      return t('mcp.form.import.errors.parseFailed', {
        line: error.position?.line ?? 0,
        column: error.position?.column ?? 0,
      })
    }
    if (error.code === 'MCP_IMPORT_EMPTY') return t('mcp.form.import.errors.empty')
    return t('mcp.form.import.errors.noServers')
  }
  return error instanceof Error ? error.message : String(error)
}

function warningText(warning: McpImportWarning): string {
  return t(`mcp.form.import.warnings.${warning.code}`, {
    detail: warning.detail ?? '',
    server: warning.serverName ?? warning.detail ?? '',
  })
}

function parseImport(): void {
  importError.value = null
  importCandidates.value = []
  importWarnings.value = []
  try {
    const result = parseMcpServerConfig(importText.value)
    importCandidates.value = result.candidates
    importWarnings.value = result.warnings
  } catch (error) {
    importError.value = importErrorMessage(error)
  }
}

function setReferences(value: Record<string, McpValueRef>): void {
  references.value = Object.entries(value).map(([key, reference]) => {
    nextReferenceId += 1
    return {
      id: `reference-${nextReferenceId}`,
      key,
      environment:
        reference.kind === 'env'
          ? reference.name
          : reference.kind === 'secret'
            ? reference.key
            : '',
    }
  })
}

function targetKey(target: McpTarget): string {
  return [target.agent, target.surface, target.scope, target.projectRoot ?? ''].join(':')
}

/**
 * 从 `~/.claude.json` 这类按项目分组的配置导入时，把对应的 local scope 目标
 * 预选上，省掉用户在手风琴里逐个展开勾选。
 */
function preselectProjectTargets(projectRoot: string | undefined): void {
  if (!projectRoot || !props.projectRoots.includes(projectRoot)) return
  const merged = new Map(targets.value.map((target) => [targetKey(target), target]))
  for (const platform of props.platforms) {
    const { capabilities } = platform
    if (capabilities.management !== 'read-write' || !capabilities.scopes.includes('local')) continue
    const target: McpTarget = {
      agent: platform.agent,
      surface: platform.surface,
      scope: 'local',
      projectRoot,
    }
    merged.set(targetKey(target), target)
  }
  targets.value = [...merged.values()]
}

/** 把候选回填到表单（而不是直接安装），用户核对目标后仍走原有预览流程。 */
function applyCandidate(candidate: McpImportCandidate): void {
  const { definition } = candidate
  const transport = definition.transport
  form.name = definition.name
  form.description = definition.description ?? ''
  if (transport.kind === 'stdio') {
    mode.value = 'stdio'
    form.command = transport.command
    form.cwd = transport.cwd ?? ''
    form.url = ''
    setArguments(transport.args)
    setReferences(transport.env)
  } else {
    mode.value = 'http'
    remoteKind.value = transport.kind
    form.url = transport.url
    form.command = ''
    form.cwd = ''
    resetArguments()
    setReferences(transport.headers)
  }
  const referenced = new Set(references.value.map((row) => row.environment.trim()))
  requiredText.value = definition.requiredSecrets
    .filter((name) => !referenced.has(name))
    .join(', ')
  preselectProjectTargets(candidate.projectRoot)
  closeImport()
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
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
            class="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="t('common.cancel')"
            :aria-label="t('common.cancel')"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="mcp-form-scroll min-h-0 flex-1 overflow-y-auto">
          <form class="px-5 py-4" @submit.prevent="submit">
            <section v-if="importOpen" class="mb-4 rounded-md border bg-muted/20 p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h3 class="text-sm font-medium">{{ t('mcp.form.import.title') }}</h3>
                <button
                  type="button"
                  class="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  :title="t('common.close')"
                  :aria-label="t('common.close')"
                  @click="closeImport"
                >
                  <X class="size-4" />
                </button>
              </div>
              <textarea
                v-model="importText"
                rows="6"
                spellcheck="false"
                :aria-label="t('mcp.form.import.title')"
                :placeholder="importPlaceholder"
                class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div class="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="cursor-pointer"
                  :disabled="!importText.trim()"
                  @click="parseImport"
                >
                  {{ t('mcp.form.import.parse') }}
                </Button>
              </div>
              <p v-if="importError" class="mt-2 text-xs text-destructive">{{ importError }}</p>
              <ul v-if="importWarnings.length" class="mt-2 space-y-1">
                <li
                  v-for="(warning, index) in importWarnings"
                  :key="index"
                  class="text-xs text-muted-foreground"
                >
                  · {{ warningText(warning) }}
                </li>
              </ul>
              <ul v-if="importCandidates.length" class="mt-2 space-y-1">
                <li v-for="(candidate, index) in importCandidates" :key="index">
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    @click="applyCandidate(candidate)"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">
                        {{ candidate.serverName }}
                        <span
                          v-if="candidate.projectRoot"
                          class="ml-2 font-normal text-muted-foreground"
                        >
                          {{ candidate.projectRoot }}
                        </span>
                      </span>
                      <span class="block truncate font-mono text-xs text-muted-foreground">
                        {{ candidate.label }}
                      </span>
                    </span>
                    <span class="shrink-0 text-xs text-primary">{{ t('mcp.form.import.use') }}</span>
                  </button>
                </li>
              </ul>
            </section>

            <Button
              v-else
              type="button"
              variant="outline"
              size="sm"
              class="mb-4 w-full cursor-pointer"
              @click="openImport"
            >
              <ClipboardPaste class="size-4" />
              {{ t('mcp.form.import.open') }}
            </Button>

            <div class="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
              <button
                type="button"
                :class="[
                  'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
                  mode === 'stdio' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
                ]"
                @click="mode = 'stdio'"
              >
                stdio
              </button>
              <button
                type="button"
                :class="[
                  'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
                  mode === 'http' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
                ]"
                @click="mode = 'http'"
              >
                {{ t('mcp.form.remote') }}
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
                {{ t(argsAsJson ? 'mcp.form.argumentsJson' : 'mcp.form.arguments') }}
                <textarea
                  v-model="argsText"
                  :rows="argsAsJson ? 5 : 3"
                  :aria-invalid="parsedArgs === null"
                  class="mcp-form-scroll w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :placeholder="argsPlaceholder"
                />
                <span v-if="parsedArgs === null" class="text-xs font-normal text-destructive">
                  {{ t('mcp.form.argumentsInvalid') }}
                </span>
              </label>
            </div>

            <div v-else class="mt-4 grid gap-4">
              <label class="grid gap-1.5 text-sm font-medium">
                {{ t('mcp.form.transport') }}
                <Select
                  v-model="remoteTransport"
                  :options="transportOptions"
                  class="w-full sm:w-64"
                />
              </label>
              <label class="grid gap-1.5 text-sm font-medium">
                {{ t('mcp.form.url') }}
                <Input v-model="form.url" autocomplete="off" placeholder="https://example.com/mcp" />
                <span v-if="form.url && !urlValid" class="text-xs font-normal text-destructive">
                  {{ t('mcp.form.urlInvalid') }}
                </span>
              </label>
            </div>

            <section class="mt-5">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="text-sm font-medium">
                  {{ mode === 'stdio' ? t('mcp.form.environment') : t('mcp.form.headers') }}
                </h3>
                <button
                  type="button"
                  class="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    class="shrink-0 cursor-pointer rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
        </div>

        <div class="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button size="sm" class="cursor-pointer" :disabled="!valid" @click="submit">
            {{ t('mcp.form.review') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped lang="scss">
.mcp-form-scroll {
  scrollbar-color: var(--scrollbar-thumb) transparent;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-radius: 999px;
  }
}
</style>
