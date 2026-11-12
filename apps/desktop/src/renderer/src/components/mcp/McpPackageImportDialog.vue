<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { Package, Search, TriangleAlert, X } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import type { McpPackageCandidate } from '#shared/mcp-packages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMcpPackageImport } from '@/composables/useMcpPackageImport'

const props = defineProps<{ projectRoots: string[] }>()
const emit = defineEmits<{ close: []; select: [candidate: McpPackageCandidate] }>()
const { t } = useI18n()
const { snapshot, status, error, busy, scan, cancel } = useMcpPackageImport()
const search = shallowRef('')
const issuesOpen = shallowRef(false)
const candidates = computed(() => {
  const query = search.value.trim().toLowerCase()
  return snapshot.value.candidates.filter((candidate) =>
    `${candidate.packageName} ${candidate.executable}`.toLowerCase().includes(query),
  )
})

function close(): void {
  void cancel()
  emit('close')
}

function select(candidate: McpPackageCandidate): void {
  void cancel()
  emit('select', candidate)
}

onMounted(() => { void scan(props.projectRoots) })
</script>

<template>
  <DialogRoot
    :open="true"
    @update:open="(open) => !open && close()"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none">
        <div class="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <DialogTitle class="text-base font-semibold">
              {{ t('mcp.packages.title') }}
            </DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('mcp.packages.reviewHint') }}
            </DialogDescription>
          </div>
          <button
            type="button"
            class="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted"
            :aria-label="t('common.close')"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </div>
        <div class="space-y-3 border-b px-5 py-3">
          <div class="relative">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="search"
              maxlength="256"
              class="pl-8"
              :placeholder="t('mcp.packages.search')"
              :aria-label="t('mcp.packages.search')"
            />
          </div>
          <div
            role="status"
            aria-live="polite"
            class="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <LoadingSpinner
              v-if="busy"
              class="size-3.5"
            />
            <span v-if="busy">{{ t('mcp.packages.scanning', { count: snapshot.scannedPackages }) }}</span>
            <span v-else>{{ t('mcp.packages.found', { count: snapshot.candidates.length }) }}</span>
          </div>
          <p
            v-if="status === 'failed'"
            class="text-xs text-destructive"
          >
            {{ t(error === 'busy' ? 'mcp.packages.busy' : 'mcp.packages.failed') }}
          </p>
          <p
            v-else-if="status === 'timed-out' || status === 'cancelled'"
            class="text-xs text-muted-foreground"
          >
            {{ t(`mcp.packages.${status}`) }}
          </p>
          <p
            v-if="snapshot.limited"
            class="text-xs text-muted-foreground"
          >
            {{ t('mcp.packages.limited') }}
          </p>
        </div>
        <ScrollArea
          class="min-h-0 flex-1"
          viewport-class="max-h-[45vh]"
        >
          <div class="space-y-2 px-5 py-3">
            <button
              v-for="candidate in candidates"
              :key="candidate.id"
              type="button"
              class="flex w-full cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40"
              @click="select(candidate)"
            >
              <Package class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate text-sm font-medium"
                  :title="candidate.packageName"
                >{{ candidate.packageName }}</span>
                <span
                  class="mt-1 block truncate font-mono text-xs text-muted-foreground"
                  :title="candidate.location"
                >{{ candidate.version }} · {{ candidate.executable }}</span>
                <span
                  v-if="candidate.projectRoot"
                  class="mt-1 block truncate text-xs text-muted-foreground"
                  :title="candidate.projectRoot"
                >{{ candidate.projectRoot }}</span>
              </span>
              <span class="flex shrink-0 flex-col items-end gap-1.5">
                <Badge
                  variant="secondary"
                  class="font-normal"
                >{{ t(`mcp.packages.sources.${candidate.source}`) }}</Badge>
                <span
                  v-if="candidate.evidence === 'inferred'"
                  class="text-xs text-muted-foreground"
                >{{ t('mcp.packages.inferred') }}</span>
              </span>
            </button>
            <p
              v-if="!candidates.length"
              class="py-10 text-center text-sm text-muted-foreground"
            >
              {{ t(busy ? 'mcp.packages.waiting' : search ? 'mcp.packages.noMatch' : 'mcp.packages.empty') }}
            </p>
            <div
              v-if="snapshot.issues.length"
              class="rounded-md border p-3"
            >
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2 text-left text-xs text-muted-foreground"
                :aria-expanded="issuesOpen"
                @click="issuesOpen = !issuesOpen"
              >
                <TriangleAlert class="size-3.5 shrink-0" />
                {{ t('mcp.packages.issues', { count: snapshot.issues.length }) }}
              </button>
              <ul
                v-if="issuesOpen"
                class="mt-2 space-y-2 text-xs text-muted-foreground"
              >
                <li
                  v-for="(issue, index) in snapshot.issues"
                  :key="index"
                >
                  {{ t(`mcp.packages.errors.${issue.code}`) }}
                  <span
                    v-if="issue.path"
                    class="mt-0.5 block break-all font-mono"
                  >{{ issue.path }}</span>
                </li>
              </ul>
            </div>
          </div>
        </ScrollArea>
        <div class="flex justify-end gap-2 border-t px-5 py-4">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            @click="close"
          >
            {{ t('common.close') }}
          </Button>
          <Button
            v-if="busy"
            variant="secondary"
            size="sm"
            class="cursor-pointer"
            @click="cancel()"
          >
            {{ t('mcp.packages.stop') }}
          </Button>
          <Button
            v-else
            variant="secondary"
            size="sm"
            class="cursor-pointer"
            @click="scan(props.projectRoots)"
          >
            {{ t('mcp.packages.rescan') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
