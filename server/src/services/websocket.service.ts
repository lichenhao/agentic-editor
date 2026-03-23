import { FastifyInstance } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'
import { prisma } from '../infrastructure/database/prisma'
import { agentEngine } from '../agents/engine/agent.engine'
import { createMessage, createSystemRecord } from './message.service'
import { recognizeIntent, getSuggestedResponse } from './intent-recognition.service'

// WebSocket 连接管理
interface Client {
  ws: WebSocket
  userId: string
  sessionId?: string
}

const clients: Map<string, Client> = new Map()

// 消息类型定义
export type ClientMessage =
  | { type: 'join_session'; sessionId: string }
  | { type: 'message'; content: string; sessionId?: string; attachments?: any[] }
  | { type: 'confirmation'; sessionId: string; confirmed: boolean; feedback?: string }
  | { type: 'selection'; stage: string; selectedIds: string[] }  // 用户选择响应
  | { type: 'confirm_draft'; draftId: string; confirmed: boolean; modifications?: any }  // 草稿确认
  | { type: 'request_revision'; draftId: string; feedback: string }  // 请求修改
  | { type: 'create_session'; agentId?: string }
  | { type: 'load_history'; sessionId: string; before?: string; limit?: number }
  | { type: 'load_products'; sessionId: string }
  | { type: 'ping' }

export type ServerMessage =
  | { type: 'thinking'; stage: string; content?: string }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'step'; stepId: string; name: string; status: 'pending' | 'executing' | 'completed' | 'failed'; output?: string }
  | { type: 'step_update'; stepId: string; status: string; output?: string }
  | { type: 'tool_call'; tool: string; params: any; status: 'calling' | 'completed' | 'error'; result?: any }
  | { type: 'tool_result'; tool: string; result: any; status: 'completed' | 'error' }
  | { type: 'message'; id: string; role: 'user' | 'assistant'; content: string; createdAt: string; delta?: string; employeeId?: string; order?: string }
  | { type: 'user_confirmation'; message: string; options: { id: string; label: string; description?: string }[] }
  | { type: 'selection_request'; stage: string; message: string; options: { id: string; label: string; description?: string }[] }
  | { type: 'draft_ready'; stage: string; draftId: string; summary: string; data: any; options: { id: string; label: string }[] }
  | { type: 'draft_confirmed'; stage: string; draftId: string; nextAction?: string }
  | { type: 'done'; summary?: string; suggestions?: { type: 'action' | 'suggestion'; label: string; content: string }[] }
  | { type: 'error'; message: string }
  | { type: 'session_created'; sessionId: string; agentId: string }
  | { type: 'session_joined'; sessionId: string; projectAgents: any[]; messages: any[] }
  | { type: 'chunking_complete'; totalChunks: number; chapters: { id: string; title: string; chunkCount: number }[] }
  | { type: 'history_loaded'; messages: any[]; hasMore: boolean }
  | { type: 'products_loaded'; products: any[] }
  | { type: 'product_created'; product: any }
  | { type: 'pong' }
  // 任务相关消息
  | { type: 'task_created'; task: any; parentTaskId?: string }
  | { type: 'task_started'; taskId: string; assignee: string }
  | { type: 'task_progress'; taskId: string; progress: number; message: string }
  | { type: 'task_completed'; taskId: string; result: any }
  | { type: 'task_failed'; taskId: string; error: string; canRetry: boolean }
  | { type: 'task_waiting_approval'; taskId: string; description: string }
  | { type: 'task_waiting_user'; taskId: string; reason: string }
  | { type: 'workflow_completed'; summary: any }
  | { type: 'workflow_blocked'; taskId: string; reason: string; suggestion: string }
  | { type: 'tasks_loaded'; tasks: any[] }

// 辅助函数：发送消息到会话（简化调用）
export function sendMessageToSession(sessionId: string, content: string) {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  sendToSession(sessionId, {
    type: 'message',
    id,
    role: 'assistant',
    content,
    createdAt: new Date().toISOString()
  })
}

interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  output?: string
}

export function setupWebSocket(fastify: FastifyInstance) {
  const wss = new WebSocketServer({ server: fastify.server })

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId()
    const userId = 'default-user' // TODO: 从认证获取

    const client: Client = { ws, userId }
    clients.set(clientId, client)

    console.log(`[WebSocket] Client connected: ${clientId}`)

    ws.on('message', async (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString())
        await handleMessage(clientId, message)
      } catch (error) {
        console.error('[WebSocket] Error handling message:', error)
        sendToClient(ws, { type: 'error', message: 'Invalid message format' })
      }
    })

    ws.on('close', () => {
      clients.delete(clientId)
      console.log(`[WebSocket] Client disconnected: ${clientId}`)
    })

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error)
      clients.delete(clientId)
    })
  })

  // 心跳保活
  setInterval(() => {
    clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping()
      }
    })
  }, 30000)

  console.log('[WebSocket] Server initialized')
}

async function handleMessage(clientId: string, message: ClientMessage) {
  const client = clients.get(clientId)
  if (!client) return

  const { ws, userId } = client

  switch (message.type) {
    case 'create_session': {
      // 创建新会话
      const session = await prisma.session.create({
        data: {
          userId,
          agentId: message.agentId || 'director',
          status: 'ACTIVE'
        }
      })
      client.sessionId = session.id
      sendToClient(ws, {
        type: 'session_created',
        sessionId: session.id,
        agentId: session.agentId
      })
      break
    }

    case 'message': {
      const content = message.content
      const sessionId = message.sessionId || client.sessionId

      if (!sessionId) {
        // 没有会话，创建新会话
        const session = await prisma.session.create({
          data: {
            userId,
            agentId: 'director',
            status: 'ACTIVE'
          }
        })
        client.sessionId = session.id
        sendToClient(ws, {
          type: 'session_created',
          sessionId: session.id,
          agentId: session.agentId
        })

        // 处理消息
        await processMessage(clientId, session.id, content, message.attachments || [])
      } else {
        // 使用现有会话
        client.sessionId = sessionId
        await processMessage(clientId, sessionId, content, message.attachments || [])
      }
      break
    }

    case 'confirmation': {
      // 用户确认响应
      const { sessionId, confirmed, feedback } = message

      if (confirmed) {
        await agentEngine.resumeSession(sessionId)
      } else {
        await agentEngine.rejectSession(sessionId, feedback || '用户取消')
      }
      break
    }

    case 'selection': {
      // 用户选择响应
      const { stage, selectedIds } = message
      const sessionId = client.sessionId

      if (sessionId) {
        console.log(`[WebSocket] User selection for ${stage}:`, selectedIds)
        // 将用户选择传递给 Agent 引擎
        await agentEngine.handleSelection(sessionId, stage, selectedIds)
      }
      break
    }

    case 'confirm_draft': {
      // 草稿确认响应
      const { draftId, confirmed, modifications } = message
      const sessionId = client.sessionId

      if (sessionId) {
        console.log(`[WebSocket] Draft confirmation: ${draftId}, confirmed: ${confirmed}`)
        await agentEngine.handleDraftConfirmation(sessionId, draftId, confirmed, modifications)
      }
      break
    }

    case 'request_revision': {
      // 请求修改草稿
      const { draftId, feedback } = message
      const sessionId = client.sessionId

      if (sessionId) {
        console.log(`[WebSocket] Revision requested for draft: ${draftId}`)
        await agentEngine.handleDraftRevision(sessionId, draftId, feedback)
      }
      break
    }

    case 'join_session': {
      // 加入会话（群聊支持）
      const { sessionId } = message
      client.sessionId = sessionId

      // 获取会话信息
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          contexts: {
            orderBy: { createdAt: 'desc' },
            take: 100
          }
        }
      })

      if (session) {
        // 获取项目的 Agent 列表
        const metadata = session.metadata as any
        const projectId = metadata?.projectId
        let projectAgents: any[] = []

        if (projectId) {
          const { ProjectAgentService } = await import('../agents/service/project-agent.service')
          projectAgents = await ProjectAgentService.getProjectAgents(projectId)
        }

        // 发送会话加入成功和历史消息
        sendToClient(ws, {
          type: 'session_joined',
          sessionId,
          projectAgents,
          messages: session.contexts.map(c => ({
            id: c.id,
            role: c.role,
            content: c.content,
            employeeId: c.employeeId,
            createdAt: c.createdAt.toISOString(),
            order: c.order.toString()
          }))
        })
      }
      break
    }

    case 'load_history': {
      // 加载历史消息（分页）
      const { sessionId, before, limit = 50 } = message
      const messages = await prisma.context.findMany({
        where: {
          sessionId,
          ...(before ? {
            createdAt: {
              lt: (await prisma.context.findUnique({ where: { id: before } }))?.createdAt
            }
          } : {})
        },
        orderBy: [
          { createdAt: 'desc' },
          { order: 'desc' }
        ],
        take: Math.min(limit, 100)
      })

      sendToClient(ws, {
        type: 'history_loaded',
        messages: messages.reverse().map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          employeeId: m.employeeId,
          createdAt: m.createdAt.toISOString(),
          order: m.order.toString()
        })),
        hasMore: messages.length === limit
      })
      break
    }

    case 'load_products': {
      // 加载工作产物
      const { sessionId } = message

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { metadata: true }
      })

      const metadata = session?.metadata as any
      const projectId = metadata?.projectId

      if (projectId) {
        const products = await prisma.workProduct.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' }
        })

        sendToClient(ws, {
          type: 'products_loaded',
          products
        })
      }
      break
    }

    case 'ping':
      sendToClient(ws, { type: 'pong' })
      break
  }
}

async function processMessage(
  clientId: string,
  sessionId: string,
  content: string,
  attachments: any[]
) {
  const client = clients.get(clientId)
  if (!client) return

  const { ws } = client

  // 如果有附件，构建附件描述信息
  let fullContent = content
  if (attachments && attachments.length > 0) {
    const attachmentDesc = attachments.map(att =>
      `[附件: ${att.fileName || att.id || '文件'} | ID: ${att.id} | SHA256: ${att.sha256}]`
    ).join('\n')
    fullContent = `${content}\n\n${attachmentDesc}`
    console.log('[WebSocket] Processing message with attachments:', attachments)
  }

  // 获取会话信息以获取 agentId
  const session = await prisma.session.findUnique({
    where: { id: sessionId }
  })

  // 保存用户消息到数据库（包含附件信息和 employeeId）
  const userMessage = await createMessage({
    sessionId,
    role: 'user',
    content: fullContent,
    attachments: attachments || [],
    employeeId: 'user',  // 用户消息标记为 'user'
    isContextMessage: true  // 参与Agent上下文
  })

  // 发送用户消息给客户端（带 id 和 timestamp）
  sendToClient(ws, {
    type: 'message',
    id: userMessage.id,
    role: 'user',
    content: fullContent,
    employeeId: 'user',
    createdAt: userMessage.createdAt.toISOString(),
    order: userMessage.order.toString()
  })

  // ===== Phase 1: 意图识别 =====
  console.log('[WebSocket] Recognizing user intent...')
  const userIntent = await recognizeIntent(content, sessionId)
  const intentSuggestion = getSuggestedResponse(userIntent)

  console.log('[WebSocket] Intent recognized:', userIntent.type, 'confidence:', userIntent.confidence)

  // ===== Phase 2: 检测并拆分小说内容（只记录不传给Agent） =====
  const novelChunks = detectNovelContent(content)
  if (novelChunks.length > 0) {
    // 写入拆分结果（role: system, isContextMessage: false - 不参与Agent上下文）
    await createSystemRecord(
      sessionId,
      JSON.stringify({ chapters: novelChunks, totalChunks: novelChunks.length }),
      {
        employeeId: 'system',
        metadata: { type: 'novel_chunking' }
      }
    )
    // 广播给前端展示
    sendToSession(sessionId, {
      type: 'chunking_complete',
      totalChunks: novelChunks.length,
      chapters: novelChunks
    })
  }

  // ===== Phase 3: 根据意图处理 =====
  // 使用 session 的 agentId 作为 employeeId
  const agentEmployeeId = session?.agentId || 'director'

  // 如果不需要继续执行，直接返回响应
  if (!intentSuggestion.shouldContinueExecution) {
    await handleIntentResponse(ws, sessionId, userIntent, intentSuggestion, agentEmployeeId)
    return
  }

  // 更新会话状态
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE', updatedAt: new Date() }
  })

  // 启动 Agent 引擎处理消息
  await agentEngine.process({
    sessionId,
    userId: client.userId,
    agentId: agentEmployeeId,
    message: content, // 原始消息内容（不包含拆分后的章节信息）
    attachments, // 附件信息
    sendEvent: (event: ServerMessage) => {
      console.log('[Server] Sending event:', event.type, event)
      // 为 assistant 消息添加 employeeId
      if (event.type === 'message' && event.role === 'assistant') {
        event.employeeId = agentEmployeeId
      }
      sendToClient(ws, event)
    }
  })
}

/**
 * 检测并拆分小说内容
 * 返回章节列表（只用于记录，不传给Agent）
 */
function detectNovelContent(text: string): { id: string; title: string; content: string }[] {
  const chunks: { id: string; title: string; content: string }[] = []

  // 章节识别模式
  const chapterPatterns = [
    /^(第[一二三四五六七八九十百千\d]+[章卷篇部])\s*(.+)/,           // 第X章
    /^(Chapter\s*\d+)\s*[:\-]?\s*(.+)/i,                              // Chapter X
    /^(第[一二三四五六七八九十百千\d]+[节部])/i,                      // 第X节
    /^【(.+)】/,                                                       // 【标题】
  ]

  // 简单检测：如果文本超过2000字，认为可能包含小说内容
  if (text.length < 2000) {
    return chunks
  }

  // 尝试识别章节标题
  const lines = text.split('\n')
  let currentChapter: { id: string; title: string; lines: string[] } | null = null

  for (const line of lines) {
    let isChapterTitle = false

    for (const pattern of chapterPatterns) {
      const match = line.match(pattern)
      if (match) {
        // 保存之前的章节
        if (currentChapter) {
          chunks.push({
            id: currentChapter.id,
            title: currentChapter.title,
            content: currentChapter.lines.join('\n')
          })
        }

        // 开始新章节
        currentChapter = {
          id: `chapter_${chunks.length + 1}`,
          title: match[1] + (match[2] ? ' ' + match[2] : ''),
          lines: []
        }
        isChapterTitle = true
        break
      }
    }

    if (!isChapterTitle && currentChapter) {
      currentChapter.lines.push(line)
    }
  }

  // 保存最后一个章节
  if (currentChapter && currentChapter.lines.length > 0) {
    chunks.push({
      id: currentChapter.id,
      title: currentChapter.title,
      content: currentChapter.lines.join('\n')
    })
  }

  return chunks
}

/**
 * 处理非执行类意图响应
 */
async function handleIntentResponse(
  ws: WebSocket,
  sessionId: string,
  userIntent: any,
  suggestion: { shouldContinueExecution: boolean; shouldRequestApproval: boolean; message?: string },
  agentEmployeeId: string
) {
  const { type } = userIntent

  switch (type) {
    case 'COMMUNICATION': {
      // 简单问候/聊天
      const responses: Record<string, string> = {
        '你好': '您好！我是AI短剧制作助手，可以帮您将小说转换为短剧视频。请问有什么可以帮助您的？',
        '谢谢': '不客气！如果有任何需求，请随时告诉我。',
        '再见': '再见！期待下次为您服务。'
      }

      const lowerInput = userIntent.details.originalInput.toLowerCase()
      let responseText = suggestion.message || '收到您的消息。请问有什么可以帮助您的？'

      for (const [key, value] of Object.entries(responses)) {
        if (lowerInput.includes(key)) {
          responseText = value
          break
        }
      }

      const assistantMessage = await createMessage({
        sessionId,
        role: 'assistant',
        content: responseText,
        employeeId: agentEmployeeId,
        isContextMessage: true
      })

      sendToClient(ws, {
        type: 'message',
        id: assistantMessage.id,
        role: 'assistant',
        content: responseText,
        employeeId: agentEmployeeId,
        createdAt: assistantMessage.createdAt.toISOString(),
        order: assistantMessage.order.toString()
      })
      sendToClient(ws, { type: 'done', summary: '对话完成' })
      break
    }

    case 'PROGRESS_QUERY': {
      // 查询进度 - 从数据库获取任务状态
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { project: true }
      })

      let progressText = '暂无进行中的任务。'

      if (session?.project) {
        const projectId = session.project.id
        const totalTasks = await prisma.task.count({ where: { projectId } })
        const completedTasks = await prisma.task.count({
          where: { projectId, status: 'COMPLETED' }
        })
        const inProgressTasks = await prisma.task.count({
          where: { projectId, status: 'IN_PROGRESS' }
        })
        const waitingTasks = await prisma.task.count({
          where: { projectId, status: 'WAITING_APPROVAL' }
        })

        progressText = `项目进度：\n` +
          `- 总任务数：${totalTasks}\n` +
          `- 已完成：${completedTasks}\n` +
          `- 进行中：${inProgressTasks}\n` +
          `- 等待确认：${waitingTasks}`

        if (waitingTasks > 0) {
          progressText += '\n\n有任务等待您的确认，请查看任务列表。'
        }
      }

      const assistantMessage = await createMessage({
        sessionId,
        role: 'assistant',
        content: progressText,
        employeeId: agentEmployeeId,
        isContextMessage: true
      })

      sendToClient(ws, {
        type: 'message',
        id: assistantMessage.id,
        role: 'assistant',
        content: progressText,
        employeeId: agentEmployeeId,
        createdAt: assistantMessage.createdAt.toISOString(),
        order: assistantMessage.order.toString()
      })
      sendToClient(ws, { type: 'done', summary: '进度查询完成' })
      break
    }

    case 'DIRECTION_CHANGE':
    case 'NEW_REQUIREMENT': {
      // 需要用户确认的新需求
      const confirmMessage = suggestion.message || '收到您的需求，请确认后我将开始执行。'

      sendToClient(ws, {
        type: 'user_confirmation',
        message: confirmMessage,
        options: [
          { id: 'confirm', label: '确认执行', description: '按照新需求继续执行' },
          { id: 'cancel', label: '取消', description: '取消当前操作' }
        ]
      })
      break
    }

    default:
      // 其他情况继续执行
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'ACTIVE', updatedAt: new Date() }
      })

      await agentEngine.process({
        sessionId,
        userId: 'default-user',
        agentId: agentEmployeeId,
        message: userIntent.details.originalInput,
        sendEvent: (event: ServerMessage) => {
          if (event.type === 'message' && event.role === 'assistant') {
            event.employeeId = agentEmployeeId
          }
          sendToClient(ws, event)
        }
      })
  }
}

function sendToClient(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 导出用于外部发送消息
export function sendToSession(sessionId: string, message: ServerMessage) {
  clients.forEach((client) => {
    if (client.sessionId === sessionId) {
      sendToClient(client.ws, message)
    }
  })
}