import { useState, useCallback, useEffect } from 'react'

export function useChatWebSocket(sessionId?: string) {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const wsUrl = `${API_BASE.replace('http', 'ws')}/ws`

    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        console.log('[Chat WS] Connected')
        setIsConnected(true)
        setError(null)

        if (sessionId) {
          socket.send(JSON.stringify({ type: 'join_session', sessionId }))
        }
        resolve(socket)
      }

      socket.onerror = (err) => {
        console.error('[Chat WS] Error:', err)
        setError('连接失败')
        reject(err)
      }

      socket.onclose = () => {
        console.log('[Chat WS] Disconnected')
        setIsConnected(false)
        setWs(null)
      }

      setWs(socket)
    })
  }, [sessionId])

  const disconnect = useCallback(() => {
    if (ws) {
      ws.close()
      setWs(null)
      setIsConnected(false)
    }
  }, [ws])

  const sendMessage = useCallback((content: string, attachments?: any[]) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', content, attachments }))
    }
  }, [ws])

  const joinSession = useCallback((sid: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join_session', sessionId: sid }))
    }
  }, [ws])

  useEffect(() => {
    if (sessionId && !ws) {
      connect().catch(err => console.error('[Chat WS] Connect failed:', err))
    }
    return () => {}
  }, [sessionId, ws, connect])

  return {
    ws,
    isConnected,
    error,
    connect,
    disconnect,
    sendMessage,
    joinSession
  }
}