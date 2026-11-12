import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  McpRemovePlanRequest,
  McpSetSecretRequest,
  McpTogglePlanRequest,
  McpUpsertPlanRequest,
} from '#shared/ipc'
import { McpService } from '../mcp/service'
import { McpPackageDiscovery } from '../mcp/packages/discovery'
import type { McpPackageScanRequest } from '#shared/mcp-packages'

/** 注册 MCP 扫描、计划、执行、撤销和监听 IPC。 */
export function registerMcpIpc(): McpService {
  const service = new McpService(join(app.getPath('userData'), 'mcp-backups'))
  const packages = new McpPackageDiscovery()
  app.once('will-quit', () => packages.dispose())
  ipcMain.handle('mcp:packages-scan', (event, request: McpPackageScanRequest) => packages.scan(request, event.sender))
  ipcMain.handle('mcp:packages-cancel', (event, requestId: string) => packages.cancel(requestId, event.sender.id))
  ipcMain.handle('mcp:scan', (_event, projectRoots: string[] = []) => service.scan(projectRoots))
  ipcMain.handle('mcp:plan-upsert', (_event, request: McpUpsertPlanRequest) =>
    service.createUpsertPlan(request),
  )
  ipcMain.handle('mcp:plan-remove', (_event, request: McpRemovePlanRequest) =>
    service.createRemovePlan(request),
  )
  ipcMain.handle('mcp:plan-toggle', (_event, request: McpTogglePlanRequest) =>
    service.createTogglePlan(request),
  )
  ipcMain.handle('mcp:apply-plan', (_event, planId: string) => service.applyPlan(planId))
  ipcMain.handle('mcp:set-secret', (_event, request: McpSetSecretRequest) =>
    service.setSecret(request),
  )
  ipcMain.handle('mcp:restore', (_event, operationId: string) => service.restore(operationId))
  ipcMain.handle('mcp:watch-start', () =>
    service.watch(() => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('mcp:changed')
      }
    }),
  )
  return service
}
