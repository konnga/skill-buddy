import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  McpRemovePlanRequest,
  McpTogglePlanRequest,
  McpUpsertPlanRequest,
} from '../../shared/ipc.js'
import { McpService } from '../mcp/service.js'

/** 注册 MCP 扫描、计划、执行、撤销和监听 IPC。 */
export function registerMcpIpc(): McpService {
  const service = new McpService(join(app.getPath('userData'), 'mcp-backups'))
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
