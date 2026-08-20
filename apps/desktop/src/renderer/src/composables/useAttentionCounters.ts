import { readonly, shallowRef } from 'vue'

const teamLibraryCount = shallowRef(0)
const teamProjectCount = shallowRef(0)

export function setTeamLibraryAttentionCount(value: number): void {
  teamLibraryCount.value = value
}

export function setTeamProjectAttentionCount(value: number): void {
  teamProjectCount.value = value
}

export function useAttentionCounters() {
  return {
    teamLibraryCount: readonly(teamLibraryCount),
    teamProjectCount: readonly(teamProjectCount),
  }
}
