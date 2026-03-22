import { FastifyInstance } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'
import { prisma } from '../infrastructure/database/prisma'
import { agentEngine } from '../agents/engine/agent.engine'
import { createMessage } from './message.service'

// WebSocket 连接管理
interface Client {
  ws: WebSocket
  userId: string
  sessionId?: string
}

const clients: Map<string, Client> = new Map()

// 消息类型定义
export type ClientMessage =
  | { type: 'message'; content: string; sessionId?: string; attachments?: any[] }
  | { type: 'confirmation'; sessionId: string; confirmed: boolean; feedback?: string }
  | { type: 'selection'; stage: string; selectedIds: string[] }  // 用户选择响应
  | { type: 'confirm_draft'; draftId: string; confirmed: boolean; modifications?: any }  // 草稿确认
  | { type: 'request_revision'; draftId: string; feedback: string }  // 请求修改
  | { type: 'create_session'; agentId?: string }
  | { type: 'ping' }

export type ServerMessage =
  | { type: 'thinking'; stage: string; content?: string }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'step'; stepId: string; name: string; status: 'pending' | 'executing' | 'completed' | 'failed'; output?: string }
  | { type: 'step_update'; stepId: string; status: string; output?: string }
  | { type: 'tool_call'; tool: string; params: any; status: 'calling' | 'completed' | 'error'; result?: any }
  | { type: 'tool_result'; tool: string; result: any; status: 'completed' | 'error' }
  | { type: 'message'; id: string; role: 'user' | 'assistant'; content: string; createdAt: string; delta?: string }
  | { type: 'user_confirmation'; message: string; options: { id: string; label: string; description?: string }[] }
  | { type: 'selection_request'; stage: string; message: string; options: { id: string; label: string; description?: string }[] }
  | { type: 'draft_ready'; stage: string; draftId: string; summary: string; data: any; options: { id: string; label: string }[] }
  | { type: 'draft_confirmed'; stage: string; draftId: string; nextAction?: string }
  | { type: 'done'; summary?: string; suggestions?: { type: 'action' | 'suggestion'; label: string; content: string }[] }
  | { type: 'error'; message: string }
  | { type: 'session_created'; sessionId: string; agentId: string }
  | { type: 'chunking_complete'; totalChunks: number; chapters: { id: string; title: string; chunkCount: number }[] }
  | { type: 'pong' }

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

  // 保存用户消息到数据库（包含附件信息）
  const userMessage = await createMessage({
    sessionId,
    role: 'user',
    content: fullContent,
    attachments: attachments || []
  })

  // 发送用户消息给客户端（带 id 和 timestamp）
  sendToClient(ws, {
    type: 'message',
    id: userMessage.id,
    role: 'user',
    content: fullContent,
    createdAt: userMessage.createdAt.toISOString()
  })

  // 更新会话状态
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE', updatedAt: new Date() }
  })

  // 启动 Agent 引擎处理消息
  await agentEngine.process({
    sessionId,
    userId: client.userId,
    message: content, // 原始消息内容
    attachments, // 附件信息
    sendEvent: (event: ServerMessage) => {
      console.log('[Server] Sending event:', event.type, event)
      sendToClient(ws, event)
    }
  })
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