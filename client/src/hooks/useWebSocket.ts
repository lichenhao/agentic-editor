import { useState, useEffect, useCallback } from 'react'
import { WSClientMessage, WSServerMessage } from '../types'

interface UseWebSocketOptions {
  sessionId?: string
  onMessage?: (message: WSServerMessage) => void
}

export function useWebSocket({ sessionId, onMessage }: UseWebSocketOptions = {}) {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 连接WebSocket
  const connect = useCallback(async () => {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const wsUrl = `${API_BASE.replace('http', 'ws')}/ws`

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        console.log('[WS] Connected')
        setIsConnected(true)
        setError(null)

        // 如果有sessionId，自动加入（适配新架构）
        if (sessionId) {
          socket.send(JSON.stringify({ type: 'JOIN_SESSION', payload: { sessionId } }))
        }

        resolve(socket)
      }

      socket.onerror = (err) => {
        console.error('[WS] Error:', err)
        setError('WebSocket连接失败')
        reject(err)
      }

      socket.onclose = () => {
        console.log('[WS] Disconnected')
        setIsConnected(false)
        setWs(null)
      }

      setWs(socket)
    })
  }, [sessionId])

  // 断开连接
  const disconnect = useCallback(() => {
    if (ws) {
      ws.close()
      setWs(null)
      setIsConnected(false)
    }
  }, [ws])

  // 发送消息（适配新架构）
  const send = useCallback((message: WSClientMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    } else {
      console.warn('[WS] Not connected, cannot send message')
    }
  }, [ws])

  // 加入会话（适配新架构）
  const joinSession = useCallback((sid: string) => {
    send({ type: 'JOIN_SESSION', payload: { sessionId: sid } })
  }, [send])

  // 发送聊天消息（适配新架构）
  const sendMessage = useCallback((content: string, attachments?: string[]) => {
    send({ type: 'SEND_MESSAGE', payload: { content, attachmentIds: attachments } })
  }, [send])

  // 加载历史消息（适配新架构）
  const loadHistory = useCallback((sid: string, limit = 50) => {
    send({ type: 'GET_HISTORY', payload: { sessionId: sid, limit } })
  }, [send])

  // 加载产物（适配新架构）
  const loadProducts = useCallback((sid: string) => {
    send({ type: 'GET_PRODUCTS', payload: { sessionId: sid } })
  }, [send])

  // 订阅消息类型
  const subscribe = useCallback((type: string, callback: (data: any) => void) => {
    if (!ws) return () => {}

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WSServerMessage
        if (data.type === type) {
          callback(data)
        }
        if (onMessage) {
          onMessage(data)
        }
      } catch (e) {
        console.error('[WS] Parse error:', e)
      }
    }

    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, onMessage])

  // 自动连接
  useEffect(() => {
    if (sessionId && !ws) {
      connect().catch(err => console.error('[WS] Connect failed:', err))
    }

    return () => {
      // 组件卸载时断开连接
    }
  }, [sessionId, ws, connect])

  return {
    ws,
    isConnected,
    error,
    connect,
    disconnect,
    send,
    joinSession,
    sendMessage,
    loadHistory,
    loadProducts,
    subscribe
  }
}