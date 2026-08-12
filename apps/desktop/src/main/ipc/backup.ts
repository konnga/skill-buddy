import { ipcMain } from 'electron'
import type { GitBackupRequest } from '../../shared/ipc.js'
import { prepareGitRestore, pushGitBackup } from '../git-backup.js'
import type { PathAccessPolicy } from '../path-policy.js'

/** 注册 Git 备份和恢复预览 IPC；实际恢复复用 Skills 安装链路。 */
export function registerBackupIpc(pathPolicy: PathAccessPolicy): void {
  ipcMain.handle('backup:push', (_event, request: GitBackupRequest) => pushGitBackup(request))
  ipcMain.handle(
    'backup:prepare-restore',
    (_event, request: Pick<GitBackupRequest, 'remoteUrl' | 'branch'>) =>
      prepareGitRestore(request, pathPolicy),
  )
}
