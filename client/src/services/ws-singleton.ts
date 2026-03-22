/**
 * WebSocket 单例模块
 *
 * 核心原则：
 * 1. 任何地方调用 getInstance() 都返回同一个 WebSocket 实例
 * 2. 连接状态与 session 分离 - WS 建立后，切换 session 发送 join_session 消息
 * 3. 不在 useEffect 中调用，而是在需要时调用
 */

import { messageApi, productApi } from './api'

// WebSocket 实例
let wsInstance: WebSocket | null = null

// 当前连接的 session ID
let currentSessionId: string | null = null

// 消息处理器
type MessageHandler = (data: any) => void
const messageHandlers: Set<MessageHandler> = new Set()

// 连接状态
let isConnected = false
let connectionListeners: Set<(connected: boolean) => void> = new Set()

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const WS_URL = `${API_BASE.replace('http', 'ws')}/ws`

/**
 * 获取 WebSocket 实例
 * @param sessionId - 可选，指定 session ID。如果不传则不加入任何 session
 * @returns WebSocket 实例
 */
export function getInstance(sessionId?: string): WebSocket {
  // 如果已存在且连接中，复用现有连接
  if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
    // 如果传入了新的 sessionId，切换 session
    if (sessionId && sessionId !== currentSessionId) {
      switchSession(sessionId)
    }
    return wsInstance
  }

  // 如果正在连接中，等待一下返回现有实例
  if (wsInstance && wsInstance.readyState === WebSocket.CONNECTING) {
    return wsInstance
  }

  // 创建新连接
  console.log('[WS Singleton] Creating new WebSocket connection')
  wsInstance = new WebSocket(WS_URL)

  // 连接超时保护
  const connectionTimeout = setTimeout(() => {
    if (wsInstance && wsInstance.readyState !== WebSocket.OPEN) {
      console.warn('[WS Singleton] Connection timeout, closing...')
      wsInstance?.close()
      wsInstance = null
      isConnected = false
      notifyConnectionListeners(false)
    }
  }, 10000)

  wsInstance.onopen = () => {
    clearTimeout(connectionTimeout)
    console.log('[WS Singleton] Connected')
    isConnected = true
    notifyConnectionListeners(true)

    // 如果传入了 sessionId，加入会话
    if (sessionId) {
      switchSession(sessionId)
    }
  }

  wsInstance.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      // 广播给所有处理器
      messageHandlers.forEach(handler => handler(data))
    } catch (err) {
      console.error('[WS Singleton] Parse error:', err)
    }
  }

  wsInstance.onclose = (event) => {
    console.log('[WS Singleton] Disconnected', event.code, event.reason)
    isConnected = false
    currentSessionId = null
    notifyConnectionListeners(false)
  }

  wsInstance.onerror = (error) => {
    console.error('[WS Singleton] Error:', error)
    clearTimeout(connectionTimeout)
  }

  return wsInstance
}

/**
 * 切换 session - 发送 join_session 消息
 */
function switchSession(sessionId: string) {
  if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    console.warn('[WS Singleton] Cannot switch session: not connected')
    return
  }

  console.log('[WS Singleton] Switching to session:', sessionId)
  currentSessionId = sessionId
  wsInstance.send(JSON.stringify({ type: 'join_session', sessionId }))
}

/**
 * 注册消息处理器
 */
export function onMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler)
  // 返回取消注册的函数
  return () => {
    messageHandlers.delete(handler)
  }
}

/**
 * 发送消息
 */
export function send(type: string, payload: any): boolean {
  if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    console.warn('[WS Singleton] Cannot send: not connected')
    return false
  }

  wsInstance.send(JSON.stringify({ type, ...payload }))
  return true
}

/**
 * 检查是否已连接
 */
export function checkConnected(): boolean {
  return isConnected && wsInstance?.readyState === WebSocket.OPEN
}

/**
 * 获取当前 session ID
 */
export function getSessionId(): string | null {
  return currentSessionId
}

/**
 * 注册连接状态变化监听器
 */
export function onConnectionChange(listener: (connected: boolean) => void): () => void {
  connectionListeners.add(listener)
  // 立即通知当前状态
  listener(isConnected)
  return () => {
    connectionListeners.delete(listener)
  }
}

function notifyConnectionListeners(connected: boolean) {
  connectionListeners.forEach(listener => listener(connected))
}

/**
 * 加载指定 session 的数据
 * 这是个便捷函数，在切换 session 时调用
 */
export async function loadSessionData(
  sessionId: string,
  options: {
    onMessages?: (messages: any[]) => void
    onProducts?: (products: any[]) => void
    onSessions?: (sessions: any[]) => void
  } = {}
) {
  const { onMessages, onProducts, onSessions } = options

  // 加载历史消息
  if (onMessages) {
    try {
      const messagesRes = await messageApi.list(sessionId)
      if (messagesRes.messages) {
        onMessages(messagesRes.messages.map((m: any) => ({
          ...m,
          order: String(m.order)
        })))
      }
    } catch (err) {
      console.error('[WS Singleton] Failed to load messages:', err)
    }
  }

  // 加载产物列表
  if (onProducts) {
    try {
      const productsRes = await productApi.list(sessionId)
      if (productsRes.products) {
        onProducts(productsRes.products)
      }
    } catch (err) {
      console.error('[WS Singleton] Failed to load products:', err)
    }
  }

  // 加载会话列表（侧边栏）
  if (onSessions) {
    try {
      const { sessionApi } = await import('./api')
      const historyRes = await sessionApi.history()
      if (historyRes.sessions) {
        onSessions(historyRes.sessions)
      }
    } catch (err) {
      console.error('[WS Singleton] Failed to load sessions:', err)
    }
  }
}

/**
 * 关闭连接（通常不需要手动调用）
 */
export function disconnect() {
  if (wsInstance) {
    wsInstance.close()
    wsInstance = null
    currentSessionId = null
    isConnected = false
  }
}