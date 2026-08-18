<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, FolderOpen, Plus } from '@lucide/vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import type { ProjectPlatformCount } from '@/composables/useSkills'
import { pathBasename } from '@/lib/paths'

const props = defineProps<{
  projectRoots: string[]
  countByProject: Map<string, number>
  projectPlatformCounts: Map<string, ProjectPlatformCount[]>
  projectFilter: string | null
  platformFilter: string | null
  skillsView: boolean
}>()
const emit = defineEmits<{
  add: []
  selectProject: [root: string]
  selectPlatform: [root: string, id: string]
}>()

const { t } = useI18n()
const expanded = shallowRef(true)
const expandedProjectRoot = computed(() =>
  props.projectFilter && props.projectFilter !== 'user' ? props.projectFilter : null,
)
</script>

<template>
  <section class="mt-4">
    <div
      class="group/scope mb-1 flex items-center justify-between rounded-lg px-2 transition-colors hover:bg-black/[0.055] focus-within:bg-black/[0.055] dark:hover:bg-white/[0.07] dark:focus-within:bg-white/[0.07]"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-controls="sidebar-scope"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronRight
          :class="[
            'size-3 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
            expanded && 'rotate-90',
          ]"
          aria-hidden="true"
        />
        <span class="truncate">{{ t('app.scope') }}</span>
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-[color,background-color,opacity] hover:bg-black/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/scope:opacity-100 group-focus-within/scope:opacity-100 dark:hover:bg-white/[0.08]"
        :title="t('app.addScope')"
        :aria-label="t('app.addScope')"
        @click="emit('add')"
      >
        <Plus class="size-3.5" />
      </button>
    </div>
    <div
      id="sidebar-scope"
      :class="[
        'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
        expanded
          ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
          : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
      ]"
      :inert="!expanded"
    >
      <div class="min-h-0 overflow-hidden">
        <template v-for="root in props.projectRoots" :key="root">
          <button
            type="button"
            :class="[
              'flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              props.skillsView &&
              props.projectFilter === root &&
              props.platformFilter === null
                ? 'nav-active'
                : 'hover:bg-accent/60',
            ]"
            :title="root"
            :aria-expanded="expandedProjectRoot === root"
            @click="emit('selectProject', root)"
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <ChevronRight
                :class="[
                  'size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                  expandedProjectRoot === root && 'rotate-90',
                ]"
                aria-hidden="true"
              />
              <FolderOpen class="size-3.5 shrink-0 text-foreground/60" />
              <span class="truncate">{{ pathBasename(root) }}</span>
            </span>
            <span class="text-sm tabular-nums text-muted-foreground">
              {{ props.countByProject.get(root) ?? 0 }}
            </span>
          </button>
          <div
            :class="[
              'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
              expandedProjectRoot === root
                ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
                : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
            ]"
            :inert="expandedProjectRoot !== root"
          >
            <div class="min-h-0 overflow-hidden">
              <div class="pb-1">
                <button
                  v-for="platform in props.projectPlatformCounts.get(root) ?? []"
                  :key="`${root}:${platform.id}`"
                  type="button"
                  :class="[
                    'flex w-full cursor-pointer items-center justify-between rounded-md py-1.5 pl-12 pr-3 text-sm transition-colors',
                    props.skillsView &&
                    props.projectFilter === root &&
                    props.platformFilter === platform.id
                      ? 'nav-active'
                      : 'hover:bg-accent/60',
                  ]"
                  :title="`${pathBasename(root)} / ${platform.displayName}`"
                  @click="emit('selectPlatform', root, platform.id)"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <PlatformIcon :id="platform.id" :size="15" class="text-foreground/70" />
                    <span class="truncate">{{ platform.displayName }}</span>
                  </span>
                  <span class="tabular-nums text-muted-foreground">{{ platform.count }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
