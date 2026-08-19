import { app, BrowserWindow, ipcMain } from 'electron'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { findSkills } from '@skillbuddy/core'
import type { AiConversationContext, AiConversationEventPayload } from '#shared/ipc'
import type { PathAccessPolicy } from './path-policy'

const execFileAsync = promisify(execFile)

/** 注册由本机 Claude Code 与 Codex CLI 驱动的对话式 Skill 创建 IPC。 */
export function registerAiConversationIpc(pathPolicy: PathAccessPolicy): void {
  /* ---------- AI generation via local agent CLIs ---------- */

  // GUI apps on macOS inherit a minimal PATH; extend it so `claude` etc. resolve
  const CLI_PATH = [
    process.env.PATH ?? '',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(process.env.HOME ?? '', '.local/bin'),
    join(process.env.HOME ?? '', '.bun/bin'),
  ].join(':')

  interface LocalAgentDef {
    id: string
    bin: string
  }

  const LOCAL_AGENTS: LocalAgentDef[] = [
    { id: 'claude-code', bin: 'claude' },
    { id: 'codex', bin: 'codex' },
    { id: 'gemini-cli', bin: 'gemini' },
  ]

  /* ---------- stateful AI conversations ---------- */

  interface CodexPendingRequest {
    resolve: (result: unknown) => void
    reject: (error: Error) => void
  }

  interface CodexAppServerState {
    child: ChildProcessWithoutNullStreams
    nextRequestId: number
    pending: Map<number, CodexPendingRequest>
    streamedItemIds: Set<string>
    stdoutBuffer: string
    stderr: string
    threadId?: string
    activeTurnId?: string
    closing: boolean
  }

  interface ConversationState {
    id: string
    agentId: string
    nativeSessionId?: string
    workspace: string
    senderId: number
    codex?: CodexAppServerState
    child?: ChildProcessWithoutNullStreams
    running: boolean
    cancelled: boolean
    errorReported: boolean
  }

  const conversations = new Map<string, ConversationState>()
  const CONVERSATION_AGENTS = new Set(['claude-code', 'codex'])
  const SKILLBUDDY_CREATOR_NAME = 'skillbuddy-skill-creator'

  const conversationSystemPrompt = `You are running inside SkillBuddy's Skill creation workspace.

Before responding, read .skillbuddy/skills/skillbuddy-skill-creator/SKILL.md completely and follow it for this entire conversation. Resolve every relative reference from that Skill's directory. The Skill owns the discovery, authoring, portability, validation, and delivery workflow; do not replace it with a generic creation process.`

  function bundledSkillCreatorRoot(): string {
    const candidates = [
      join(process.resourcesPath, 'skills', SKILLBUDDY_CREATOR_NAME),
      join(app.getAppPath(), 'resources', 'skills', SKILLBUDDY_CREATOR_NAME),
      join(import.meta.dirname, '..', '..', 'resources', 'skills', SKILLBUDDY_CREATOR_NAME),
    ]
    const root = candidates.find((candidate) => existsSync(candidate))
    if (!root) throw new Error(`${SKILLBUDDY_CREATOR_NAME} resource not found`)
    return root
  }

  function sendConversationEvent(
    state: ConversationState,
    event: AiConversationEventPayload,
  ): void {
    const sender = BrowserWindow.getAllWindows()
      .map((window) => window.webContents)
      .find((contents) => contents.id === state.senderId)
    sender?.send('ai:conversation-event', { conversationId: state.id, ...event })
  }

  function renderConversationContext(context: AiConversationContext): string {
    const skills = context.skills.length
      ? context.skills
          .slice(0, 300)
          .map(
            (skill) =>
              `- ${skill.name} [${skill.agents.join(', ') || 'unknown'}]: ${skill.description}`,
          )
          .join('\n')
      : '- No existing Skills were detected.'
    const platforms = context.platforms.length
      ? context.platforms.map((platform) => `- ${platform.displayName} (${platform.id})`).join('\n')
      : '- No AI agent platforms were detected.'
    const editingSkill = context.editingSkill
      ? `## Skill being edited

- Name: ${context.editingSkill.name}
- Source path: ${context.editingSkill.sourcePath}

Read the existing package from this source path, but only write the revised final package under \`output/\`.`
      : ''
    return `# SkillBuddy context

## Existing Skills

${skills}

## Detected platforms

${platforms}

${editingSkill}
`
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null
  }

  function activityLabel(item: Record<string, unknown>): string | null {
    if (
      (item.type === 'commandExecution' || item.type === 'command_execution') &&
      typeof item.command === 'string'
    ) {
      return item.command
    }
    if (item.type === 'mcpToolCall' || item.type === 'mcp_tool_call') {
      const server = typeof item.server === 'string' ? item.server : ''
      const tool = typeof item.tool === 'string' ? item.tool : ''
      return [server, tool].filter(Boolean).join('.') || null
    }
    if (item.type === 'dynamicToolCall' && typeof item.tool === 'string') {
      return item.tool
    }
    if (item.type === 'webSearch' && typeof item.query === 'string') {
      return item.query
    }
    if (item.type === 'fileChange' || item.type === 'file_change') {
      const changes = Array.isArray(item.changes) ? item.changes : []
      const paths = changes.flatMap((change) => {
        const record = asRecord(change)
        return record && typeof record.path === 'string' ? [record.path] : []
      })
      return paths.length > 0 ? paths.join(', ') : 'Updating Skill files'
    }
    return null
  }

  function writeCodexMessage(client: CodexAppServerState, message: unknown): void {
    if (!client.child.stdin.writable) throw new Error('Codex app-server is not writable')
    client.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  function requestCodex(
    client: CodexAppServerState,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const id = client.nextRequestId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.pending.delete(id)
        reject(new Error(`Codex app-server request timed out: ${method}`))
      }, 30_000)
      client.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
      try {
        writeCodexMessage(client, { method, id, params })
      } catch (error) {
        client.pending.delete(id)
        clearTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function rejectCodexRequests(client: CodexAppServerState, error: Error): void {
    for (const request of client.pending.values()) request.reject(error)
    client.pending.clear()
  }

  async function finishCodexTurn(
    state: ConversationState,
    status: string,
    failureMessage?: string,
  ): Promise<void> {
    try {
      await emitConversationArtifacts(state)
    } catch (error) {
      state.errorReported = true
      sendConversationEvent(state, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      state.cancelled = false
      return
    }

    if (state.cancelled || status === 'interrupted') {
      sendConversationEvent(state, { type: 'cancelled' })
    } else if (status === 'failed') {
      if (!state.errorReported) {
        sendConversationEvent(state, {
          type: 'error',
          message: failureMessage || 'Codex conversation failed',
        })
      }
    } else if (!state.errorReported) {
      sendConversationEvent(state, { type: 'completed' })
    }
    state.cancelled = false
  }

  function handleCodexMessage(state: ConversationState, line: string): void {
    const client = state.codex
    if (!client) return

    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }

    if (typeof entry.id === 'number' && typeof entry.method !== 'string') {
      const pending = client.pending.get(entry.id)
      if (!pending) return
      client.pending.delete(entry.id)
      const error = asRecord(entry.error)
      if (error) {
        pending.reject(
          new Error(typeof error.message === 'string' ? error.message : 'Codex request failed'),
        )
      } else {
        pending.resolve(entry.result)
      }
      return
    }

    const method = typeof entry.method === 'string' ? entry.method : ''
    if (!method) return

    if (entry.id !== undefined) {
      writeCodexMessage(client, {
        id: entry.id,
        error: {
          code: -32601,
          message: `SkillBuddy does not handle ${method}`,
        },
      })
      return
    }

    const params = asRecord(entry.params)
    if (!params) return
    if (
      client.threadId &&
      typeof params.threadId === 'string' &&
      params.threadId !== client.threadId
    ) {
      return
    }

    if (method === 'turn/started') {
      const turn = asRecord(params.turn)
      if (turn && typeof turn.id === 'string') {
        client.activeTurnId = turn.id
        if (state.cancelled) {
          void requestCodex(client, 'turn/interrupt', {
            threadId: client.threadId,
            turnId: turn.id,
          }).catch(() => undefined)
        }
      }
      return
    }

    if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      if (typeof params.itemId === 'string') client.streamedItemIds.add(params.itemId)
      sendConversationEvent(state, { type: 'assistant-delta', text: params.delta })
      return
    }

    if (method === 'item/started') {
      const item = asRecord(params.item)
      if (!item) return
      const label = activityLabel(item)
      if (label) sendConversationEvent(state, { type: 'activity', label })
      return
    }

    if (method === 'item/completed') {
      const item = asRecord(params.item)
      if (
        item?.type === 'agentMessage' &&
        typeof item.id === 'string' &&
        !client.streamedItemIds.has(item.id) &&
        typeof item.text === 'string'
      ) {
        sendConversationEvent(state, { type: 'assistant-delta', text: item.text })
      }
      return
    }

    if (method === 'error') {
      const error = asRecord(params.error)
      const message =
        error && typeof error.message === 'string' ? error.message : 'Codex conversation failed'
      state.errorReported = true
      sendConversationEvent(state, { type: 'error', message })
      return
    }

    if (method === 'turn/completed') {
      const turn = asRecord(params.turn)
      const turnError = asRecord(turn?.error)
      const status = typeof turn?.status === 'string' ? turn.status : 'failed'
      const failureMessage =
        turnError && typeof turnError.message === 'string' ? turnError.message : undefined
      client.activeTurnId = undefined
      state.running = false
      void finishCodexTurn(state, status, failureMessage)
    }
  }

  async function startCodexAppServer(state: ConversationState): Promise<CodexAppServerState> {
    const child = spawn('codex', ['app-server'], {
      cwd: state.workspace,
      env: { ...process.env, PATH: CLI_PATH },
      stdio: 'pipe',
    })
    const client: CodexAppServerState = {
      child,
      nextRequestId: 1,
      pending: new Map(),
      streamedItemIds: new Set(),
      stdoutBuffer: '',
      stderr: '',
      closing: false,
    }
    state.codex = client

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      client.stdoutBuffer += chunk
      const lines = client.stdoutBuffer.split(/\r?\n/)
      client.stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) handleCodexMessage(state, line)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      client.stderr = `${client.stderr}${chunk}`.slice(-4000)
    })
    child.on('error', (error) => {
      rejectCodexRequests(client, error)
      if (client.activeTurnId && !state.errorReported) {
        state.errorReported = true
        sendConversationEvent(state, { type: 'error', message: error.message })
      }
    })
    child.on('close', (code) => {
      if (client.stdoutBuffer.trim()) handleCodexMessage(state, client.stdoutBuffer)
      rejectCodexRequests(
        client,
        new Error(
          client.stderr.trim().slice(-1000) || `Codex app-server exited with code ${code ?? 'unknown'}`,
        ),
      )
      if (state.codex === client) state.codex = undefined
      if (!client.closing && client.activeTurnId && !state.errorReported) {
        state.errorReported = true
        sendConversationEvent(state, {
          type: 'error',
          message:
            client.stderr.trim().slice(-1000) ||
            `Codex app-server exited with code ${code ?? 'unknown'}`,
        })
      }
      if (client.activeTurnId) state.running = false
    })

    try {
      await requestCodex(client, 'initialize', {
        clientInfo: {
          name: 'skillbuddy',
          title: 'SkillBuddy',
          version: app.getVersion(),
        },
      })
      writeCodexMessage(client, { method: 'initialized', params: {} })
      const response = asRecord(
        await requestCodex(client, 'thread/start', {
          cwd: state.workspace,
          approvalPolicy: 'never',
          sandbox: 'workspace-write',
          developerInstructions: conversationSystemPrompt,
          ephemeral: true,
          serviceName: 'skillbuddy',
        }),
      )
      const thread = asRecord(response?.thread)
      if (!thread || typeof thread.id !== 'string') {
        throw new Error('Codex app-server did not return a thread id')
      }
      client.threadId = thread.id
      state.nativeSessionId = thread.id
      sendConversationEvent(state, { type: 'session', nativeSessionId: thread.id })
      return client
    } catch (error) {
      client.closing = true
      if (state.codex === client) state.codex = undefined
      child.kill('SIGTERM')
      throw error
    }
  }

  async function ensureCodexAppServer(state: ConversationState): Promise<CodexAppServerState> {
    const existing = state.codex
    if (existing && existing.child.exitCode === null && !existing.child.killed) return existing
    return startCodexAppServer(state)
  }

  async function sendCodexTurn(state: ConversationState, message: string): Promise<void> {
    const client = await ensureCodexAppServer(state)
    client.streamedItemIds.clear()
    const creatorPath = join(
      state.workspace,
      '.skillbuddy',
      'skills',
      SKILLBUDDY_CREATOR_NAME,
      'SKILL.md',
    )
    const response = asRecord(
      await requestCodex(client, 'turn/start', {
        threadId: client.threadId,
        input: [
          {
            type: 'text',
            text: `$${SKILLBUDDY_CREATOR_NAME} ${message}`,
            text_elements: [],
          },
          {
            type: 'skill',
            name: SKILLBUDDY_CREATOR_NAME,
            path: creatorPath,
          },
        ],
      }),
    )
    const turn = asRecord(response?.turn)
    if (state.running && turn && typeof turn.id === 'string') client.activeTurnId = turn.id
    if (state.cancelled && client.activeTurnId) {
      await requestCodex(client, 'turn/interrupt', {
        threadId: client.threadId,
        turnId: client.activeTurnId,
      })
    }
  }

  function claudeCommand(state: ConversationState, message: string): string[] {
    const args = [
      '-p',
      message,
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
    ]
    if (state.nativeSessionId) {
      args.push('--resume', state.nativeSessionId)
    } else {
      args.push('--append-system-prompt', conversationSystemPrompt)
    }
    return args
  }

  function parseClaudeLine(state: ConversationState, line: string): void {
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }

    if (
      entry.type === 'system' &&
      entry.subtype === 'init' &&
      typeof entry.session_id === 'string'
    ) {
      state.nativeSessionId = entry.session_id
      sendConversationEvent(state, { type: 'session', nativeSessionId: entry.session_id })
      return
    }
    if (entry.type === 'stream_event') {
      const event = asRecord(entry.event)
      const delta = asRecord(event?.delta)
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        sendConversationEvent(state, { type: 'assistant-delta', text: delta.text })
      }
      return
    }
    if (entry.type === 'assistant') {
      const message = asRecord(entry.message)
      const content = message?.content
      if (!Array.isArray(content)) return
      for (const block of content) {
        const record = asRecord(block)
        if (record?.type === 'tool_use' && typeof record.name === 'string') {
          sendConversationEvent(state, { type: 'activity', label: record.name })
        }
      }
      return
    }
    if (entry.type === 'result' && entry.is_error === true) {
      const message = typeof entry.result === 'string' ? entry.result : 'Claude conversation failed'
      state.errorReported = true
      sendConversationEvent(state, { type: 'error', message })
    }
  }

  function sendClaudeTurn(state: ConversationState, message: string): void {
    const child = spawn('claude', claudeCommand(state, message), {
      cwd: state.workspace,
      env: { ...process.env, PATH: CLI_PATH },
      stdio: 'pipe',
    })
    state.child = child

    let stdoutBuffer = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) parseClaudeLine(state, line)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000)
    })
    child.on('error', (error) => {
      state.errorReported = true
      sendConversationEvent(state, { type: 'error', message: error.message })
    })
    child.on('close', (code) => {
      if (stdoutBuffer.trim()) parseClaudeLine(state, stdoutBuffer)
      state.child = undefined
      state.running = false
      void (async () => {
        try {
          await emitConversationArtifacts(state)
        } catch (error) {
          state.errorReported = true
          sendConversationEvent(state, {
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
          state.cancelled = false
          return
        }
        if (state.cancelled) {
          sendConversationEvent(state, { type: 'cancelled' })
        } else if (code === 0 && !state.errorReported) {
          sendConversationEvent(state, { type: 'completed' })
        } else if (!state.errorReported) {
          sendConversationEvent(state, {
            type: 'error',
            message: stderr.trim().slice(-1000) || `agent exited with code ${code ?? 'unknown'}`,
          })
        }
        state.cancelled = false
      })()
    })
  }

  async function emitConversationArtifacts(state: ConversationState): Promise<void> {
    const items = await findSkills(join(state.workspace, 'output'))
    if (items.length > 0) sendConversationEvent(state, { type: 'artifact', items })
  }

  ipcMain.handle('ai:conversation-agents', async () => {
    const available = await Promise.all(
      LOCAL_AGENTS.filter((generator) => CONVERSATION_AGENTS.has(generator.id)).map(
        async (generator) => {
          try {
            await execFileAsync('which', [generator.bin], {
              env: { ...process.env, PATH: CLI_PATH },
            })
            if (generator.id === 'codex') {
              await execFileAsync(generator.bin, ['app-server', '--help'], {
                env: { ...process.env, PATH: CLI_PATH },
                timeout: 10_000,
              })
            }
            return generator.id
          } catch {
            return null
          }
        },
      ),
    )
    return available.filter((id): id is string => id !== null)
  })

  ipcMain.handle(
    'ai:conversation-create',
    async (event, agentId: string, context: AiConversationContext) => {
      if (!CONVERSATION_AGENTS.has(agentId)) {
        throw new Error(`agent does not support conversations: ${agentId}`)
      }
      const id = randomUUID()
      const workspace = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-ai-'))
      pathPolicy.grantTemporaryRoot(workspace)
      try {
        await fs.mkdir(join(workspace, 'output'), { recursive: true })
        const creatorRoot = join(
          workspace,
          '.skillbuddy',
          'skills',
          SKILLBUDDY_CREATOR_NAME,
        )
        await fs.mkdir(dirname(creatorRoot), { recursive: true })
        await fs.cp(bundledSkillCreatorRoot(), creatorRoot, { recursive: true })
        await fs.writeFile(
          join(workspace, 'SKILLBUDDY_CONTEXT.md'),
          renderConversationContext(context),
          'utf8',
        )
        conversations.set(id, {
          id,
          agentId,
          workspace,
          senderId: event.sender.id,
          running: false,
          cancelled: false,
          errorReported: false,
        })
        return { conversationId: id }
      } catch (error) {
        pathPolicy.revokeTemporaryRoot(workspace)
        await fs.rm(workspace, { recursive: true, force: true })
        throw error
      }
    },
  )

  ipcMain.handle('ai:conversation-send', async (_event, conversationId: string, message: string) => {
    const state = conversations.get(conversationId)
    if (!state) throw new Error('conversation not found')
    if (state.running) throw new Error('conversation is already running')
    if (!message.trim()) throw new Error('message is empty')

    state.running = true
    state.cancelled = false
    state.errorReported = false
    try {
      if (state.agentId === 'codex') {
        await sendCodexTurn(state, message.trim())
      } else if (state.agentId === 'claude-code') {
        sendClaudeTurn(state, message.trim())
      } else {
        throw new Error(`agent does not support conversations: ${state.agentId}`)
      }
    } catch (error) {
      state.running = false
      throw error
    }
  })

  ipcMain.handle('ai:conversation-cancel', async (_event, conversationId: string) => {
    const state = conversations.get(conversationId)
    if (!state?.running) return false
    state.cancelled = true
    if (state.agentId === 'codex') {
      const client = state.codex
      if (!client?.activeTurnId) return true
      try {
        await requestCodex(client, 'turn/interrupt', {
          threadId: client.threadId,
          turnId: client.activeTurnId,
        })
        return true
      } catch {
        return false
      }
    }
    return state.child?.kill('SIGTERM') ?? false
  })

  ipcMain.handle('ai:conversation-dispose', async (_event, conversationId: string) => {
    const state = conversations.get(conversationId)
    if (!state) return
    state.cancelled = true
    state.running = false
    state.child?.kill('SIGTERM')
    if (state.codex) {
      state.codex.closing = true
      rejectCodexRequests(state.codex, new Error('conversation disposed'))
      state.codex.child.kill('SIGTERM')
    }
    conversations.delete(conversationId)
    pathPolicy.revokeTemporaryRoot(state.workspace)
    await fs.rm(state.workspace, { recursive: true, force: true })
  })

}
