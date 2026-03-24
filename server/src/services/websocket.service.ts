/**
 * WebSocket Service - Multi-Agent 架构客户端通信服务
 * 基于扁平化 Agent 架构的实时通信
 */

import { FastifyInstance } from 'fastify'
import { WebSocketServer, WebSocket } from 'ws'
import { prisma } from '../infrastructure/database/prisma'
import { agentEngine } from '../agents/engine/agent.engine'
import { sessionService } from '../services/session.service'
import { contextService } from '../services/context.service'

// WebSocket 连接管理
interface Client {
  ws: WebSocket
  userId: string
  sessionId?: string
  sequence: number
}

const clients: Map<string, Client> = new Map()

// ============================================
// 消息类型定义（与 websocket-protocol.service.ts 保持一致）
// ============================================

export type ClientMessage =
  // 会话管理
  | { type: 'CREATE_SESSION'; payload?: { title?: string } }
  | { type: 'JOIN_SESSION'; payload: { sessionId: string } }
  | { type: 'LEAVE_SESSION'; payload?: { sessionId: string } }
  | { type: 'DELETE_SESSION'; payload: { sessionId: string } }

  // 消息处理
  | { type: 'SEND_MESSAGE'; payload: { sessionId?: string; content: string; attachmentIds?: string[] } }

  // 用户交互
  | { type: 'CONFIRM_TASK'; payload: { taskId: string; approved: boolean; feedback?: string } }
  | { type: 'CANCEL_TASK'; payload: { taskId?: string; sessionId: string } }
  | { type: 'FEEDBACK'; payload: { taskId: string; feedback: string } }

  // 数据查询
  | { type: 'GET_HISTORY'; payload: { sessionId: string; limit?: number; offset?: number } }
  | { type: 'GET_SESSIONS' }
  | { type: 'GET_DAG_STATUS'; payload: { sessionId: string } }
  | { type: 'GET_PRODUCTS'; payload: { sessionId: string } }

  // 心跳
  | { type: 'PING' }

export type ServerMessage =
  // 会话相关
  | { type: 'SESSION_CREATED'; payload: { sessionId: string; secretaryAgentId: string } }
  | { type: 'SESSION_JOINED'; payload: { sessionId: string; secretaryType: string; messages: any[] } }
  | { type: 'SESSION_DELETED'; payload: { sessionId: string } }
  | { type: 'SESSIONS_LIST'; payload: { sessions: any[] } }

  // Agent 状态
  | { type: 'AGENT_STATUS'; payload: { agentId: string; status: 'IDLE' | 'RUNNING' | 'WAITING' | 'COMPLETED'; progress?: number } }
  | { type: 'SECRETARY_THINKING'; payload: { stage: string; content: string } }

  // 任务状态
  | { type: 'TASK_STATUS'; payload: { taskId: string; status: string; progress?: number; message?: string } }
  | { type: 'TASK_OUTPUT'; payload: { taskId: string; output: any; type: string } }
  | { type: 'TASK_WAITING'; payload: { taskId: string; message: string } }
  | { type: 'DAG_STATUS'; payload: { nodes: any[]; edges: any[]; executable: string[] } }

  // 消息
  | { type: 'MESSAGE'; payload: { id: string; role: 'user' | 'assistant' | 'agent' | 'system'; content: string; sourceAgent?: string; createdAt: string; order: string; metadata?: any } }
  | { type: 'HISTORY'; payload: { contexts: any[]; hasMore: boolean } }

  // 产出物
  | { type: 'PRODUCT_CREATED'; payload: { productId: string; product: any } }
  | { type: 'PRODUCTS'; payload: { products: any[] } }

  // 用户交互请求
  | { type: 'USER_INTERACTION'; payload: { type: 'CONFIRM' | 'FEEDBACK'; taskId: string; message: string; options?: string[] } }

  // 完成
  | { type: 'DONE'; payload: { summary: string; report?: any } }

  // 错误
  | { type: 'ERROR'; payload: { code: string; message: string; taskId?: string } }

  // 心跳
  | { type: 'PONG' }

// ============================================
// 工具函数
// ============================================

function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function sendToClient(ws: WebSocket, message: ServerMessage, sequence?: number): void {
  if (ws.readyState !== WebSocket.OPEN) return

  const envelope = {
    sequence: sequence ?? Date.now(),
    timestamp: new Date().toISOString(),
    ...message
  }

  ws.send(JSON.stringify(envelope))
}

function sendToSession(sessionId: string, message: ServerMessage): void {
  clients.forEach((client) => {
    if (client.sessionId === sessionId) {
      sendToClient(client.ws, message, client.sequence++)
    }
  })
}

function broadcast(message: ServerMessage): void {
  clients.forEach((client) => {
    sendToClient(client.ws, message, client.sequence++)
  })
}

// ============================================
// WebSocket 设置
// ============================================

export function setupWebSocket(fastify: FastifyInstance) {
  const wss = new WebSocketServer({ server: fastify.server })

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId()
    const userId = 'default-user' // TODO: 从认证获取

    const client: Client = { ws, userId, sequence: 0 }
    clients.set(clientId, client)

    console.log(`[WebSocket] Client connected: ${clientId}`)

    ws.on('message', async (data) => {
      try {
        const raw = JSON.parse(data.toString())
        const message: ClientMessage = raw
        // 使用客户端提供的序列号或生成新的
        client.sequence = raw.sequence ?? client.sequence
        await handleMessage(clientId, message)
      } catch (error) {
        console.error('[WebSocket] Error handling message:', error)
        sendToClient(ws, {
          type: 'ERROR',
          payload: { code: 'INVALID_MESSAGE', message: 'Invalid message format' }
        })
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

// ============================================
// 消息处理
// ============================================

async function handleMessage(clientId: string, message: ClientMessage) {
  const client = clients.get(clientId)
  if (!client) return

  const { ws, userId } = client

  console.log(`[WebSocket] Handling message: ${message.type}`)

  try {
    switch (message.type) {
      // ==================== 会话管理 ====================
      case 'CREATE_SESSION': {
        const result = await agentEngine.createSession({
          userId,
          title: message.payload?.title
        })

        if (result.success && result.sessionId && result.secretaryAgentId) {
          client.sessionId = result.sessionId
          sendToClient(ws, {
            type: 'SESSION_CREATED',
            payload: {
              sessionId: result.sessionId,
              secretaryAgentId: result.secretaryAgentId
            }
          })
        } else {
          sendToClient(ws, {
            type: 'ERROR',
            payload: { code: 'CREATE_FAILED', message: result.error || 'Failed to create session' }
          })
        }
        break
      }

      case 'JOIN_SESSION': {
        const { sessionId } = message.payload
        client.sessionId = sessionId

        // 获取会话信息
        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            contexts: { orderBy: { createdAt: 'asc' }, take: 50 }
          }
        })

        if (session) {
          sendToClient(ws, {
            type: 'SESSION_JOINED',
            payload: {
              sessionId: session.id,
              secretaryType: session.secretaryType,
              messages: session.contexts
            }
          })
        } else {
          sendToClient(ws, {
            type: 'ERROR',
            payload: { code: 'SESSION_NOT_FOUND', message: 'Session not found' }
          })
        }
        break
      }

      case 'DELETE_SESSION': {
        const { sessionId } = message.payload
        await agentEngine.deleteSession(sessionId)
        sendToClient(ws, {
          type: 'SESSION_DELETED',
          payload: { sessionId }
        })
        break
      }

      case 'GET_SESSIONS': {
        const result = await agentEngine.getSessions(userId)
        sendToClient(ws, {
          type: 'SESSIONS_LIST',
          payload: { sessions: result.sessions || [] }
        })
        break
      }

      // ==================== 消息处理 ====================
      case 'SEND_MESSAGE': {
        const { sessionId: msgSessionId, content, attachmentIds } = message.payload
        let sessionId = msgSessionId || client.sessionId

        // 如果没有会话，创建新会话
        if (!sessionId) {
          const result = await agentEngine.createSession({ userId })
          if (!result.success || !result.sessionId || !result.secretaryAgentId) {
            sendToClient(ws, {
              type: 'ERROR',
              payload: { code: 'CREATE_FAILED', message: result.error || 'Failed to create session' }
            })
            return
          }
          sessionId = result.sessionId
          client.sessionId = sessionId
          sendToClient(ws, {
            type: 'SESSION_CREATED',
            payload: { sessionId, secretaryAgentId: result.secretaryAgentId }
          })
        }

        // 调用 Agent Engine 处理
        await agentEngine.process({
          sessionId,
          userId,
          message: content,
          attachments: attachmentIds,
          sendEvent: (event) => {
            // 将 Agent 事件转换为 WebSocket 消息
            const wsMessage = convertAgentEventToWebSocket(event)
            if (wsMessage) {
              sendToClient(ws, wsMessage, client.sequence++)
            }
          }
        })
        break
      }

      // ==================== 用户交互 ====================
      case 'CONFIRM_TASK': {
        const { taskId, approved, feedback } = message.payload
        const sessionId = client.sessionId

        if (!sessionId) {
          sendToClient(ws, {
            type: 'ERROR',
            payload: { code: 'NO_SESSION', message: 'No active session' }
          })
          return
        }

        await agentEngine.handleConfirmation(sessionId, taskId, approved, feedback)
        break
      }

      case 'CANCEL_TASK': {
        const { sessionId: cancelSessionId, taskId } = message.payload
        const sessionId = cancelSessionId || client.sessionId

        if (!sessionId) {
          sendToClient(ws, {
            type: 'ERROR',
            payload: { code: 'NO_SESSION', message: 'No active session' }
          })
          return
        }

        await agentEngine.handleCancellation(sessionId, taskId)
        break
      }

      // ==================== 数据查询 ====================
      case 'GET_HISTORY': {
        const { sessionId: historySessionId, limit, offset } = message.payload
        const result = await agentEngine.getHistory(historySessionId, limit || 50)
        sendToClient(ws, {
          type: 'HISTORY',
          payload: { contexts: result.contexts || [], hasMore: (result.contexts?.length || 0) >= (limit || 50) }
        })
        break
      }

      case 'GET_DAG_STATUS': {
        const { sessionId: dagSessionId } = message.payload
        const status = await agentEngine.getDAGStatus(dagSessionId)
        sendToClient(ws, {
          type: 'DAG_STATUS',
          payload: status
        })
        break
      }

      case 'GET_PRODUCTS': {
        const { sessionId: productsSessionId } = message.payload
        const products = await prisma.workProduct.findMany({
          where: { sessionId: productsSessionId }
        })
        sendToClient(ws, {
          type: 'PRODUCTS',
          payload: { products }
        })
        break
      }

      // ==================== 心跳 ====================
      case 'PING': {
        sendToClient(ws, { type: 'PONG' })
        break
      }

      default:
        console.warn(`[WebSocket] Unknown message type: ${(message as any).type}`)
    }
  } catch (error: any) {
    console.error('[WebSocket] Error:', error)
    sendToClient(ws, {
      type: 'ERROR',
      payload: { code: 'INTERNAL_ERROR', message: error.message }
    })
  }
}

// ============================================
// Agent 事件转换为 WebSocket 消息
// ============================================

function convertAgentEventToWebSocket(event: any): ServerMessage | null {
  switch (event.type) {
    case 'thinking':
      return {
        type: 'SECRETARY_THINKING',
        payload: { stage: event.stage, content: event.content }
      }

    case 'task_status':
      return {
        type: 'TASK_STATUS',
        payload: {
          taskId: event.taskId,
          status: event.status,
          progress: event.progress,
          message: event.message
        }
      }

    case 'task_output':
      return {
        type: 'TASK_OUTPUT',
        payload: { taskId: event.taskId, output: event.output, type: 'text' }
      }

    case 'user_interaction':
      return {
        type: 'USER_INTERACTION',
        payload: {
          type: 'CONFIRM',
          taskId: event.taskId,
          message: event.message
        }
      }

    case 'message':
      return {
        type: 'MESSAGE',
        payload: {
          id: event.id,
          role: event.role,
          content: event.content,
          sourceAgent: event.employeeId,
          createdAt: event.createdAt,
          order: event.order,
          metadata: event.metadata
        }
      }

    case 'done':
      return {
        type: 'DONE',
        payload: { summary: event.summary, report: event.report }
      }

    case 'error':
      return {
        type: 'ERROR',
        payload: { code: 'AGENT_ERROR', message: event.message }
      }

    case 'all_complete':
      return {
        type: 'DONE',
        payload: { summary: event.message }
      }

    default:
      return null
  }
}

// ============================================
// 导出工具函数
// ============================================

export function sendMessageToSession(sessionId: string, content: string, sourceAgent?: string) {
  sendToSession(sessionId, {
    type: 'MESSAGE',
    payload: {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content,
      sourceAgent,
      createdAt: new Date().toISOString(),
      order: Date.now().toString()
    }
  })
}