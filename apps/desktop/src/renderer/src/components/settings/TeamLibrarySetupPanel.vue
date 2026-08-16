<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  FolderGit2,
  KeyRound,
  LoaderCircle,
  PackagePlus,
  Search,
} from '@lucide/vue'
import type {
  TeamLibraryConfig,
  TeamLibraryProbeResult,
} from '../../../../shared/ipc.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { showToast } from '@/composables/useToast'

const emit = defineEmits<{
  connected: [config: TeamLibraryConfig]
}>()

const { t } = useI18n()
const remoteUrl = shallowRef('')
const branch = shallowRef('')
const libraryName = shallowRef('')
const operation = shallowRef<'probe' | 'initialize' | null>(null)
const error = shallowRef<string | null>(null)
const probe = shallowRef<TeamLibraryProbeResult | null>(null)

const libraryId = computed(() =>
  suggestedId(remoteUrl.value) || suggestedId(libraryName.value) || 'team-library',
)
const busy = computed(() => operation.value !== null)
const canProbe = computed(() => Boolean(remoteUrl.value.trim() && !busy.value))
const canInitialize = computed(() =>
  Boolean(
    probe.value?.status === 'empty' &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(libraryId.value) &&
    libraryName.value.trim() &&
    branch.value.trim() &&
    !busy.value,
  ),
)

watch([remoteUrl, branch], () => {
  probe.value = null
  error.value = null
}, { flush: 'sync' })

function repositoryName(url: string): string {
  return url.replace(/\/$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') ?? ''
}

function suggestedId(url: string): string {
  return repositoryName(url)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function reset(): void {
  remoteUrl.value = ''
  branch.value = ''
  libraryName.value = ''
  probe.value = null
  error.value = null
}

async function inspectRemote(): Promise<void> {
  if (!canProbe.value) return
  operation.value = 'probe'
  error.value = null
  probe.value = null
  try {
    const result = await window.skillsManager.teamLibraryProbe({
      remoteUrl: remoteUrl.value.trim(),
      ...(branch.value.trim() ? { branch: branch.value.trim() } : {}),
    })
    if (result.status === 'ready') {
      emit('connected', { remoteUrl: result.remoteUrl, branch: result.branch })
      showToast({
        message: t('settings.teamLibraryConnected', { name: result.manifest?.name ?? result.branch }),
      })
      reset()
      return
    }
    if (result.status === 'empty') {
      branch.value = result.branch
      const name = repositoryName(result.remoteUrl)
      libraryName.value = name
      probe.value = result
      return
    }
    probe.value = result
    if (result.status === 'branch-missing') {
      error.value = t('settings.teamLibraryBranchMissing', {
        branch: result.branch,
        default: result.defaultBranch ?? result.branches[0] ?? '-',
        branches: result.branches.join(', '),
      })
      return
    }
    error.value = result.error ?? t('settings.teamLibraryInvalid')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    operation.value = null
  }
}

async function initialize(): Promise<void> {
  if (!canInitialize.value) return
  operation.value = 'initialize'
  error.value = null
  try {
    const result = await window.skillsManager.teamLibraryInitialize({
      remoteUrl: remoteUrl.value.trim(),
      branch: branch.value.trim(),
      id: libraryId.value,
      name: libraryName.value.trim(),
    })
    emit('connected', result.config)
    showToast({
      message: t('settings.teamLibraryInitialized', { name: result.manifest.name }),
    })
    reset()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    operation.value = null
  }
}
</script>

<template>
  <div class="rounded-xl border bg-muted/20 p-5">
    <div class="flex items-start gap-3">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
        <FolderGit2 class="size-4 text-muted-foreground" />
      </div>
      <div>
        <p class="text-sm font-medium">{{ t('settings.teamLibraryFormTitle') }}</p>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('settings.teamLibraryFormDesc') }}
        </p>
      </div>
    </div>

    <div class="mt-5 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
      <label class="grid gap-1.5 text-sm font-medium">
        <span>{{ t('settings.teamLibraryRemoteLabel') }}</span>
        <Input
          v-model="remoteUrl"
          :placeholder="t('settings.teamLibraryRemotePh')"
          :disabled="busy"
        />
      </label>
      <label class="grid gap-1.5 text-sm font-medium">
        <span>{{ t('settings.teamLibraryBranchLabel') }}</span>
        <Input
          v-model="branch"
          :placeholder="t('settings.teamLibraryBranchPh')"
          :disabled="busy"
        />
      </label>
      <p class="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
        <KeyRound class="mt-0.5 size-3.5 shrink-0" />
        <span>{{ t('settings.teamLibraryAuthHint') }}</span>
      </p>
      <p
        v-if="error"
        class="flex items-start gap-2 break-all text-xs text-destructive sm:col-span-2"
      >
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
        <span>{{ error }}</span>
      </p>
      <div class="flex justify-end sm:col-span-2">
        <Button class="w-full sm:w-auto" :disabled="!canProbe" @click="inspectRemote">
          <LoaderCircle v-if="operation === 'probe'" class="size-4 animate-spin" />
          <Search v-else class="size-4" />
          {{ operation === 'probe' ? t('settings.teamLibraryChecking') : t('settings.teamLibraryCheck') }}
        </Button>
      </div>
    </div>

    <div v-if="probe?.status === 'empty'" class="mt-5 border-t pt-5">
      <div class="flex items-start gap-3">
        <PackagePlus class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p class="text-sm font-medium">{{ t('settings.teamLibraryInitializeTitle') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t('settings.teamLibraryInitializeDesc') }}
          </p>
        </div>
      </div>
      <div class="mt-4 grid gap-4">
        <label class="grid gap-1.5 text-sm font-medium">
          <span>{{ t('settings.teamLibraryNameLabel') }}</span>
          <Input
            v-model="libraryName"
            :placeholder="t('settings.teamLibraryNamePh')"
            :disabled="busy"
          />
        </label>
        <div class="flex justify-end">
          <Button class="w-full sm:w-auto" :disabled="!canInitialize" @click="initialize">
            <LoaderCircle v-if="operation === 'initialize'" class="size-4 animate-spin" />
            <PackagePlus v-else class="size-4" />
            {{ operation === 'initialize' ? t('settings.teamLibraryInitializing') : t('settings.teamLibraryInitialize') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
