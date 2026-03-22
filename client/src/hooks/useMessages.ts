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

  // 按order排序插入消息
  const insertMessage = useCallback((newMsg: Message) => {
    setMessages(prev => {
      const order = BigInt(newMsg.order || '0')
      const index = prev.findIndex(m => BigInt(m.order || '0') > order)
      if (index === -1) {
        return [...prev, newMsg]
      }
      return [...prev.slice(0, index), newMsg, ...prev.slice(index)]
    })
  }, [])

  // 处理接收到的消息
  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'session_joined':
        // 会话加入成功，载入初始消息
        if (data.messages) {
          const msgs = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            employeeId: m.employeeId,
            createdAt: m.createdAt,
            order: m.order
          }))
          // 按时间正序
          msgs.sort((a: Message, b: Message) => {
            const orderA = BigInt(a.order || '0')
            const orderB = BigInt(b.order || '0')
            return orderA < orderB ? -1 : orderA > orderB ? 1 : 0
          })
          setMessages(msgs)
        }
        break

      case 'message':
        // 新消息
        insertMessage({
          id: data.id,
          role: data.role,
          content: data.content,
          employeeId: data.employeeId,
          createdAt: data.createdAt || new Date().toISOString(),
          order: data.order || Date.now().toString()
        })
        break

      case 'history_loaded':
        // 历史消息（分页）
        if (data.messages) {
          const newMessages = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            employeeId: m.employeeId,
            createdAt: m.createdAt,
            order: m.order
          }))

          setMessages(prev => {
            // 去重并合并
            const existingIds = new Set(prev.map(m => m.id))
            const unique = newMessages.filter((m: Message) => !existingIds.has(m.id))
            // 合并后按order排序
            return [...prev, ...unique].sort((a, b) => {
              const orderA = BigInt(a.order || '0')
              const orderB = BigInt(b.order || '0')
              return orderA < orderB ? -1 : orderA > orderB ? 1 : 0
            })
          })

          setHasMore(data.hasMore)
          if (data.hasMore && newMessages.length > 0) {
            nextCursorRef.current = newMessages[0].id
          }
        }
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

  // 加载更多历史消息
  const loadMore = useCallback(() => {
    if (!hasMore || !sessionId) return

    setIsLoading(true)
    // 通过WebSocket发送加载历史请求
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'load_history',
        sessionId,
        before: nextCursorRef.current,
        limit: 50
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