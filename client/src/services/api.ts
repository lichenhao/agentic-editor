const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// 会话相关API
export const sessionApi = {
  // 创建新会话
  create: async (agentId?: string, projectName?: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, projectName })
    })
    return res.json()
  },

  // 获取会话详情
  get: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`)
    return res.json()
  },

  // 获取会话列表
  list: async () => {
    const res = await fetch(`${API_BASE}/api/chat/sessions`)
    return res.json()
  },

  // 获取会话历史
  history: async () => {
    const res = await fetch(`${API_BASE}/api/chat/history`)
    return res.json()
  },

  // 删除会话
  delete: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`, {
      method: 'DELETE'
    })
    return res.json()
  }
}

// 消息相关API
export const messageApi = {
  // 获取消息（默认最近100条，支持分页）
  list: async (sessionId: string, before?: string, limit = 100) => {
    const params = new URLSearchParams()
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))

    const res = await fetch(
      `${API_BASE}/api/chat/sessions/${sessionId}/messages?${params}`
    )
    return res.json()
  },

  // 获取消息总数
  count: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages/count`)
    return res.json()
  },

  // 获取上下文（旧接口）
  contexts: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/contexts`)
    return res.json()
  }
}

// 文件上传API
export const uploadApi = {
  // 上传文件
  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    })
    return res.json()
  },

  // 获取文件分片信息
  getChunks: async (fileId: string) => {
    const res = await fetch(`${API_BASE}/api/upload/${fileId}/chunks`)
    return res.json()
  },

  // 读取指定分片
  readChunks: async (fileId: string, chunkIndices?: number[], chapterId?: string) => {
    const res = await fetch(`${API_BASE}/api/upload/chunks/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, chunkIndices, chapterId })
    })
    return res.json()
  },

  // 获取文件列表
  list: async () => {
    const res = await fetch(`${API_BASE}/api/upload`)
    return res.json()
  },

  // 获取单个文件信息
  get: async (fileId: string) => {
    const res = await fetch(`${API_BASE}/api/upload/${fileId}`)
    return res.json()
  },

  // 删除文件
  delete: async (fileId: string) => {
    const res = await fetch(`${API_BASE}/api/upload/${fileId}`, {
      method: 'DELETE'
    })
    return res.json()
  }
}

// 工作产物API
export const productApi = {
  // 获取会话的所有产物
  list: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/products`)
    return res.json()
  },

  // 获取单个产物
  get: async (sessionId: string, productId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/products/${productId}`)
    return res.json()
  },

  // 创建产物
  create: async (sessionId: string, data: {
    projectId: string
    type: string
    name: string
    description?: string
    mimeType?: string
    content?: string
    storageKey?: string
    creatorAgentId?: string
    metadata?: any
  }) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return res.json()
  },

  // 删除产物
  delete: async (sessionId: string, productId: string) => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/products/${productId}`, {
      method: 'DELETE'
    })
    return res.json()
  }
}

// WebSocket连接管理
let ws: WebSocket | null = null
let wsListeners: Map<string, Set<(data: any) => void>> = new Map()

export const websocketApi = {
  // 连接到WebSocket
  connect: (sessionId?: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const wsUrl = `${API_BASE.replace('http', 'ws')}/ws`
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[WS] Connected')
        // 如果有sessionId，自动加入
        if (sessionId) {
          ws?.send(JSON.stringify({ type: 'join_session', sessionId }))
        }
        resolve(ws!)
      }

      ws.onerror = (error) => {
        console.error('[WS] Error:', error)
        reject(error)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          // 触发对应类型的监听器
          const listeners = wsListeners.get(data.type)
          if (listeners) {
            listeners.forEach(callback => callback(data))
          }
          // 触发 all 监听器
          const allListeners = wsListeners.get('*')
          if (allListeners) {
            allListeners.forEach(callback => callback(data))
          }
        } catch (e) {
          console.error('[WS] Parse error:', e)
        }
      }

      ws.onclose = () => {
        console.log('[WS] Disconnected')
        ws = null
      }
    })
  },

  // 断开连接
  disconnect: () => {
    if (ws) {
      ws.close()
      ws = null
    }
  },

  // 发送消息
  send: (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  },

  // 订阅消息类型
  subscribe: (type: string, callback: (data: any) => void) => {
    if (!wsListeners.has(type)) {
      wsListeners.set(type, new Set())
    }
    wsListeners.get(type)!.add(callback)

    // 返回取消订阅函数
    return () => {
      wsListeners.get(type)?.delete(callback)
    }
  },

  // 加入会话
  joinSession: (sessionId: string) => {
    websocketApi.send({ type: 'join_session', sessionId })
  },

  // 发送聊天消息
  sendMessage: (content: string, attachments?: any[]) => {
    websocketApi.send({ type: 'message', content, attachments })
  },

  // 加载历史消息
  loadHistory: (sessionId: string, before?: string, limit = 50) => {
    websocketApi.send({ type: 'load_history', sessionId, before, limit })
  },

  // 加载产物
  loadProducts: (sessionId: string) => {
    websocketApi.send({ type: 'load_products', sessionId })
  },

  // 获取连接状态
  isConnected: () => ws !== null && ws.readyState === WebSocket.OPEN
}