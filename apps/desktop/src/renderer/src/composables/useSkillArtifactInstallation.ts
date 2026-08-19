import { computed, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type { FoundSkill, PlatformStatus, Skill } from '@skillbuddy/core'
import type { InstallTarget, TargetResult } from '#shared/ipc'
import { agentLabel } from '@/lib/agents'

interface UseSkillArtifactInstallationOptions {
  artifact: Readonly<Ref<FoundSkill | null>>
  detectedPlatforms: Readonly<Ref<PlatformStatus[]>>
  installSkill: (skill: Skill, targets: InstallTarget[]) => Promise<TargetResult[]>
}

export function useSkillArtifactInstallation(options: UseSkillArtifactInstallationOptions) {
  const targets = ref<InstallTarget[]>([])
  const installing = shallowRef(false)
  const installError = shallowRef<string | null>(null)
  const installedKey = shallowRef<string | null>(null)

  const artifactRevision = computed(() => {
    if (!options.artifact.value) return ''
    const skill = options.artifact.value.skill
    return JSON.stringify({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      resources: Object.keys(skill.resources ?? {}).sort(),
    })
  })

  /** 产物内容和安装目标共同决定当前界面是否可显示为“已安装”。 */
  const currentInstallKey = computed(() =>
    JSON.stringify({
      revision: artifactRevision.value,
      targets: [...targets.value]
        .map((target) => [target.agent, target.scope, target.projectRoot ?? ''].join(':'))
        .sort(),
    }),
  )

  const artifactInstalled = computed(
    () => artifactRevision.value !== '' && currentInstallKey.value === installedKey.value,
  )

  function setTargets(value: InstallTarget[]): void {
    targets.value = value
  }

  async function installArtifact(): Promise<void> {
    if (!options.artifact.value || targets.value.length === 0 || installing.value) return
    const artifact = options.artifact.value
    const requestedTargets = [...targets.value]
    const requestedInstallKey = currentInstallKey.value
    installing.value = true
    installError.value = null
    try {
      const results = await options.installSkill(artifact.skill, requestedTargets)
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        installError.value = failed
          .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
          .join('；')
        return
      }
      /** 异步安装完成时仍记录请求快照，目标或产物已变化则不会误显示“已安装”。 */
      installedKey.value = requestedInstallKey
    } catch (error) {
      installError.value = error instanceof Error ? error.message : String(error)
    } finally {
      installing.value = false
    }
  }

  watch(options.artifact, () => {
    installError.value = null
  })

  onMounted(() => {
    targets.value = options.detectedPlatforms.value.map((platform) => ({
      agent: platform.id,
      scope: 'user',
    }))
  })

  return {
    targets,
    installing,
    installError,
    artifactInstalled,
    setTargets,
    installArtifact,
  }
}
