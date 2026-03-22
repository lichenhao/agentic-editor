import { useState, useEffect, useCallback } from 'react'
import { sessionApi, productApi, messageApi, uploadApi } from './services/api'
import { ChatPanel } from './components/Chat/ChatPanel'
import { Modal } from './components/Layout/Modal'
import { Message, WorkProduct, Session } from './types'
import './styles/design-tokens.css'
import './styles/global.css'
import './App.css'

function App() {
  // ============ 状态管理 ============
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)

  // 消息状态
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(true)

  // 产物状态 (使用 HTTP 加载)
  const [products, setProducts] = useState<WorkProduct[]>([])

  // 侧边栏状态
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true)

  // 弹窗状态
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // 文件上传状态
  const [isUploading, setIsUploading] = useState(false)

  // WebSocket 状态 (仅用于聊天)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // ============ 加载会话列表 (HTTP) ============
  const loadSessions = useCallback(async () => {
    try {
      const data = await sessionApi.history()
      if (data.sessions) {
        setSessions(data.sessions)
        if (data.sessions.length > 0 && !currentSession) {
          selectSession(data.sessions[0])
        }
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }, [currentSession])

  useEffect(() => {
    loadSessions()
  }, [])

  // ============ 选择会话 ============
  const selectSession = useCallback(async (session: Session) => {
    setCurrentSession(session)

    // 从 metadata 获取 projectId
    const metadata = session.metadata as any
    const projectId = metadata?.projectId

    if (projectId) {
      try {
        // 加载项目数据（暂时未使用）
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/projects/${projectId}`)

        // 使用 HTTP 加载产物
        const productsRes = await productApi.list(session.id)
        if (productsRes.products) {
          setProducts(productsRes.products)
        }

        // 使用 HTTP 加载消息 (默认100条)
        const messagesRes = await messageApi.list(session.id)
        if (messagesRes.messages) {
          setMessages(messagesRes.messages.map((m: any) => ({
            ...m,
            order: String(m.order)
          })))
          setHasMore(messagesRes.hasMore)
        }
      } catch (err) {
        console.error('Failed to load project data:', err)
      }
    }

    // 连接 WebSocket (仅用于实时聊天)
    connectWebSocket(session.id)
  }, [])

  // ============ WebSocket 连接 (仅聊天) ============
  const connectWebSocket = useCallback((sessionId: string) => {
    if (ws) {
      ws.close()
    }

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const wsUrl = `${API_BASE.replace('http', 'ws')}/ws`
    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log('[Chat WS] Connected')
      setIsConnected(true)
      socket.send(JSON.stringify({ type: 'join_session', sessionId }))
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleWsMessage(data)
      } catch (err) {
        console.error('[Chat WS] Parse error:', err)
      }
    }

    socket.onclose = () => {
      console.log('[Chat WS] Disconnected')
      setIsConnected(false)
    }

    setWs(socket)
  }, [])

  // ============ 处理 WebSocket 消息 ============
  const handleWsMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'session_joined':
        if (data.messages && Array.isArray(data.messages)) {
          const msgs = data.messages.map((m: any) => ({
            ...m,
            order: String(m.order)
          })).sort((a: Message, b: Message) => {
            const orderA = BigInt(a.order || '0')
            const orderB = BigInt(b.order || '0')
            return orderA < orderB ? -1 : orderA > orderB ? 1 : 0
          })
          setMessages(msgs)
        }
        break

      case 'message':
        setMessages(prev => {
          const newMsg: Message = {
            id: data.id,
            role: data.role,
            content: data.content,
            employeeId: data.employeeId,
            createdAt: data.createdAt || new Date().toISOString(),
            order: String(data.order || Date.now())
          }
          const order = BigInt(newMsg.order)
          const index = prev.findIndex(m => BigInt(m.order || '0') > order)
          if (index === -1) return [...prev, newMsg]
          return [...prev.slice(0, index), newMsg, ...prev.slice(index)]
        })
        break

      case 'history_loaded':
        if (data.messages && Array.isArray(data.messages)) {
          const newMessages = data.messages.map((m: any) => ({
            ...m,
            order: String(m.order)
          }))
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            const unique = newMessages.filter((m: Message) => !existingIds.has(m.id))
            return [...prev, ...unique].sort((a: Message, b: Message) => {
              const orderA = BigInt(a.order || '0')
              const orderB = BigInt(b.order || '0')
              return orderA < orderB ? -1 : orderA > orderB ? 1 : 0
            })
          })
          setHasMore(data.hasMore)
        }
        break
    }
  }, [])

  // ============ 创建新会话 (HTTP) ============
  const createSession = async () => {
    try {
      const data = await sessionApi.create(undefined, `新项目_${Date.now()}`)
      if (data.session) {
        await loadSessions()
        selectSession(data.session)
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  // ============ 删除会话 ============
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个项目吗？')) return

    try {
      await sessionApi.delete(sessionId)
      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
        setMessages([])
        setProducts([])
      }
      await loadSessions()
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // ============ 发送消息 (WS) ============
  const handleSendMessage = useCallback((content: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Chat WS] Not connected')
      return
    }
    ws.send(JSON.stringify({ type: 'message', content }))
  }, [ws])

  // ============ 加载更多消息 (WS) ============
  const handleLoadMore = useCallback(() => {
    if (!hasMore || !currentSession || !ws || ws.readyState !== WebSocket.OPEN) return

    const oldestMsg = messages[0]
    if (oldestMsg) {
      ws.send(JSON.stringify({
        type: 'load_history',
        sessionId: currentSession.id,
        before: oldestMsg.id,
        limit: 50
      }))
    }
  }, [hasMore, currentSession, messages, ws])

  // ============ 刷新产物 (HTTP) ============
  const handleRefreshProducts = useCallback(async () => {
    if (!currentSession) return
    try {
      const data = await productApi.list(currentSession.id)
      if (data.products) {
        setProducts(data.products)
      }
    } catch (err) {
      console.error('Failed to refresh products:', err)
    }
  }, [currentSession])

  // ============ 直接上传文件 ============
  const handleAttach = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,.pdf'
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (!file) return

      setIsUploading(true)
      try {
        const result = await uploadApi.upload(file)
        if (result.error) {
          alert('上传失败: ' + result.error)
          return
        }
        console.log('文件上传成功:', result.fileName, '分片数:', result.chunkCount)
      } catch (err) {
        console.error('Upload error:', err)
        alert('上传失败，请重试')
      } finally {
        setIsUploading(false)
      }
    }
    input.click()
  }, [])

  // ============ 组件卸载时断开连接 ============
  useEffect(() => {
    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [ws])

  // ============ 渲染 ============
  const metadata = currentSession?.metadata as any
  const projectName = metadata?.projectName || '未命名项目'

  return (
    <div className="app">
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-left">
          <button className="header-btn" onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
            <span>{projectName}</span>
          </button>
        </div>

        <div className="header-center">
          <h1 className="app-title">AI 短剧助手</h1>
        </div>

        <div className="header-right">
          <button
            className="header-btn"
            onClick={() => {
              // 有产物时才能展开右侧栏
              if (products.length > 0) {
                setRightSidebarCollapsed(!rightSidebarCollapsed)
              }
            }}
            title={products.length > 0 ? "工作产物" : "暂无产物"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            {products.length > 0 && <span className="badge">{products.length}</span>}
          </button>
          <button className="header-btn" onClick={() => setShowSettingsModal(true)} title="设置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* 核心聊天区域 - 三栏布局 */}
      <main className="app-main">
        {/* 左侧栏 - 对话历史 */}
        <aside className={`sidebar-left ${leftSidebarCollapsed ? 'collapsed' : ''}`}>
          {!leftSidebarCollapsed && (
            <>
              <div className="sidebar-header">
                <span>项目列表</span>
                <button className="sidebar-toggle" onClick={createSession} title="新建项目">+</button>
              </div>
              <div className="project-list">
                {sessions.map((session) => {
                  const m = session.metadata as any
                  return (
                    <div
                      key={session.id}
                      className={`project-item ${currentSession?.id === session.id ? 'active' : ''}`}
                      onClick={() => selectSession(session)}
                    >
                      <span className="project-item-icon">📁</span>
                      <div className="project-item-info">
                        <span className="project-item-name">{m?.projectName || '未命名'}</span>
                        <span className="project-item-date">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="project-delete-btn"
                        onClick={(e) => deleteSession(session.id, e)}
                        title="删除项目"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </aside>

        {/* 中间栏 - 聊天区域 */}
        <div className="chat-container">
          {currentSession ? (
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              onLoadMore={handleLoadMore}
              onAttach={handleAttach}
              onCommand={() => {}}
              hasMore={hasMore}
              isConnected={isConnected}
              isUploading={isUploading}
              tokenUsage={{ used: 4000, total: 100000 }}
            />
          ) : (
            <div className="no-session">
              <div className="no-session-content">
                <span className="no-session-icon">💬</span>
                <p>选择一个项目开始对话</p>
                <button className="btn btn-primary" onClick={createSession}>
                  创建新项目
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右侧栏 - 产物面板 */}
        <aside className={`sidebar-right ${rightSidebarCollapsed ? 'collapsed' : ''}`}>
          {!rightSidebarCollapsed && products.length > 0 && (
            <>
              <div className="sidebar-header">
                <span>工作产物 ({products.length})</span>
                <button className="sidebar-toggle" onClick={handleRefreshProducts} title="刷新">🔄</button>
              </div>
              <div className="product-list">
                {products.map((product) => (
                  <div key={product.id} className="product-item">
                    <span className="product-item-icon">
                      {product.type === 'IMAGE' ? '🖼️' :
                       product.type === 'VIDEO' ? '🎬' :
                       product.type === 'TEXT' ? '📄' : '📦'}
                    </span>
                    <div className="product-item-info">
                      <span className="product-item-name">{product.name}</span>
                      <span className="product-item-meta">
                        {product.creatorAgentId} · {new Date(product.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>

      {/* 设置弹窗 */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="设置"
        size="sm"
      >
        <div className="settings-content">
          <p>设置功能开发中...</p>
        </div>
      </Modal>
    </div>
  )
}

export default App