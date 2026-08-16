import type { TeamLibraryConfig } from './ipc.js'

/** 复制为可跨 Electron IPC 传输的普通对象，避免传入 Vue Proxy。 */
export function plainTeamLibraryConfig(config: TeamLibraryConfig): TeamLibraryConfig {
  return {
    remoteUrl: config.remoteUrl,
    branch: config.branch,
  }
}

/** 规范化团队库分支；空值统一使用 main。 */
export function normalizeTeamLibraryBranch(branch: string): string {
  return branch.trim() || 'main'
}

/** 返回本地配置的稳定键，用于匹配同一远程仓库与分支。 */
export function teamLibraryConfigKey(config: Pick<TeamLibraryConfig, 'remoteUrl' | 'branch'>): string {
  return JSON.stringify([config.remoteUrl.trim(), normalizeTeamLibraryBranch(config.branch)])
}
