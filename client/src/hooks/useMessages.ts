import { useState, useCallback, useRef, useEffect } from 'react'
import { Message } from '../types'

interface UseMessagesOptions {
  sessionId?: string
  ws: WebSocket | null
}

export function useMessages({ sessionId, ws }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const nextCursorRef = useRef<string | null>(null)

  // 按时间排序插入消息
  const insertMessage = useCallback((newMsg: Message) => {
    setMessages(prev => {
      const time = new Date(newMsg.createdAt).getTime()
      const index = prev.findIndex(m => new Date(m.createdAt).getTime() > time)
      if (index === -1) {
        return [...prev, newMsg]
      }
      return [...prev.slice(0, index), newMsg, ...prev.slice(index)]
    })
  }, [])

  // 处理接收到的消息（适配新架构）
  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'SESSION_CREATED':
        // 会话创建成功
        console.log('[useMessages] Session created:', data.sessionId)
        break

      case 'message':
      case 'MESSAGE':
        // 新消息（适配新架构）
        insertMessage({
          id: data.id || data.payload?.id,
          sessionId: data.sessionId || data.payload?.sessionId,
          role: data.role || data.payload?.role || 'assistant',
          content: data.content || data.payload?.content,
          sourceAgent: data.sourceAgent || data.payload?.sourceAgent,
          metadata: data.payload?.metadata,
          createdAt: data.createdAt || data.payload?.createdAt || new Date().toISOString()
        })
        break

      case 'HISTORY':
      case 'history_loaded':
        // 历史消息（适配新架构）
        const msgs = data.contexts || data.messages || []
        const newMessages = msgs.map((m: any) => ({
          id: m.id,
          sessionId: m.sessionId,
          role: m.role,
          content: m.content,
          sourceAgent: m.sourceAgent,
          metadata: m.metadata,
          createdAt: m.createdAt
        }))

        setMessages(prev => {
          // 去重并合并
          const existingIds = new Set(prev.map(m => m.id))
          const unique = newMessages.filter((m: Message) => !existingIds.has(m.id))
          // 合并后按时间排序
          return [...prev, ...unique].sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        })

        setHasMore(data.hasMore ?? false)
        break

      case 'thinking':
        // Secretary 思考状态（不作为消息显示）
        console.log('[useMessages] Thinking:', data.stage, data.content)
        break

      case 'error':
        // 错误消息
        console.error('[useMessages] Error:', data.message)
        break
    }
  }, [insertMessage])

  // 订阅WebSocket消息
  useEffect(() => {
    if (!ws) return

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        handleMessage(data)
      } catch (e) {
        console.error('[useMessages] Parse error:', e)
      }
    }

    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, handleMessage])

  // 加载更多历史消息（适配新架构）
  const loadMore = useCallback(() => {
    if (!hasMore || !sessionId) return

    setIsLoading(true)
    // 通过WebSocket发送加载历史请求
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'GET_HISTORY',
        payload: {
          sessionId,
          before: nextCursorRef.current,
          limit: 50
        }
      }))
    }
    setIsLoading(false)
  }, [hasMore, sessionId, ws])

  // 清空消息
  const clearMessages = useCallback(() => {
    setMessages([])
    nextCursorRef.current = null
    setHasMore(true)
  }, [])

  return {
    messages,
    isLoading,
    hasMore,
    loadMore,
    clearMessages,
    insertMessage
  }
}