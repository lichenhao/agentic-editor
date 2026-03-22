import { useState, useEffect, useCallback } from 'react'
import { sessionApi, productApi, messageApi, uploadApi } from './services/api'
import { ChatPanel } from './components/Chat/ChatPanel'
import { Modal } from './components/Layout/Modal'
import { ResizableLayout } from './components/Layout/ResizableLayout'
import { Message, WorkProduct, Session } from './types'
import { TaskInfo } from './components/Task/TaskProgressDrawer'
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

  // 侧边栏状态 - 已移至 ResizableLayout 组件管理
  // const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  // const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true)

  // 弹窗状态
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // 文件上传状态
  const [isUploading, setIsUploading] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ name: string; status: 'uploading' | 'ready' | 'error' } | null>(null)

  // WebSocket 状态 (仅用于聊天)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // 任务状态
  const [tasks, setTasks] = useState<TaskInfo[]>([])

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

      case 'thinking':
        // Agent 正在工作中，通过任务进度显示
        break

      case 'message':
        // 收到 Agent 消息
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

      case 'done':
        // 完成
        break

      case 'error':
        // 错误
        break

      // 任务相关消息
      case 'task_created':
        setTasks(prev => [...prev, {
          id: data.task.id,
          name: data.task.name,
          type: data.task.type,
          status: data.task.status,
          assigneeType: data.task.assigneeType
        }])
        break

      case 'task_started':
        setTasks(prev => prev.map(t =>
          t.id === data.taskId ? { ...t, status: 'IN_PROGRESS', startedAt: new Date().toISOString() } : t
        ))
        break

      case 'task_completed':
        setTasks(prev => prev.map(t =>
          t.id === data.taskId ? { ...t, status: 'COMPLETED', completedAt: new Date().toISOString() } : t
        ))
        break

      case 'task_failed':
        setTasks(prev => prev.map(t =>
          t.id === data.taskId ? { ...t, status: 'FAILED' } : t
        ))
        break

      case 'task_waiting_approval':
        setTasks(prev => prev.map(t =>
          t.id === data.taskId ? { ...t, status: 'WAITING_APPROVAL' } : t
        ))
        break

      case 'tasks_loaded':
        if (data.tasks && Array.isArray(data.tasks)) {
          setTasks(data.tasks.map((t: any) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            status: t.status,
            assigneeType: t.assigneeType,
            startedAt: t.startedAt,
            completedAt: t.completedAt
          })))
        }
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

  // ============ 创建新项目 (带弹窗输入) ============
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('请输入项目名称')
      return
    }

    setIsCreating(true)
    try {
      const data = await sessionApi.create(undefined, newProjectName.trim())
      if (data.session) {
        // 重置弹窗状态
        setShowCreateModal(false)
        setNewProjectName('')
        setNewProjectDesc('')
        // 加载会话列表并选择新会话
        await loadSessions()
        selectSession(data.session)
      }
    } catch (err) {
      console.error('Failed to create project:', err)
      alert('创建失败，请重试')
    } finally {
      setIsCreating(false)
    }
  }

  // 删除按钮点击处理 - 使用事件代理
  const handleDeleteClick = (sessionId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个项目吗？')) return

    deleteSessionById(sessionId)
  }

  // ============ 删除会话 (独立函数) ============
  const deleteSessionById = async (sessionId: string) => {
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

      // 设置文件状态为上传中
      setAttachedFile({ name: file.name, status: 'uploading' })
      setIsUploading(true)

      try {
        const result = await uploadApi.upload(file)
        if (result.error) {
          setAttachedFile({ name: file.name, status: 'error' })
          alert('上传失败: ' + result.error)
          // 3秒后清除错误状态
          setTimeout(() => setAttachedFile(null), 3000)
          return
        }
        console.log('文件上传成功:', result.fileName, '分片数:', result.chunkCount)
        setAttachedFile({ name: file.name, status: 'ready' })
      } catch (err) {
        console.error('Upload error:', err)
        setAttachedFile({ name: file.name, status: 'error' })
        alert('上传失败，请重试')
        // 3秒后清除错误状态
        setTimeout(() => setAttachedFile(null), 3000)
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
      {/* 核心聊天区域 - 三栏布局 */}
      <main className="app-main">
        <ResizableLayout
          leftWidth={200}
          rightWidth={360}
          minCenterWidth={400}
          minSideWidth={300}
          onLeftToggle={() => {}}
          onRightToggle={() => {}}
          leftPanel={
            <>
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
                        onClick={handleDeleteClick(session.id)}
                        title="删除项目"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
                <button className="new-project-btn" onClick={() => setShowCreateModal(true)}>
                  + 新建项目
                </button>
              </div>
            </>
          }
          centerPanel={
            currentSession ? (
              <ChatPanel
                messages={messages}
                onSendMessage={handleSendMessage}
                onLoadMore={handleLoadMore}
                onAttach={handleAttach}
                onCommand={() => {}}
                onToggleLeft={() => {}}
                onToggleRight={() => {}}
                hasMore={hasMore}
                isConnected={isConnected}
                isUploading={isUploading}
                tokenUsage={{ used: 4000, total: 100000 }}
                attachedFile={attachedFile}
                sessionTitle={projectName}
                tasks={tasks}
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
            )
          }
          rightPanel={
            products.length > 0 && (
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
            )
          }
        />
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

      {/* 新建项目弹窗 */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setNewProjectName('')
          setNewProjectDesc('')
        }}
        title="新建项目"
        size="md"
      >
        <div className="create-project-form">
          <div className="form-group">
            <label>项目名称 *</label>
            <input
              type="text"
              className="form-input"
              placeholder="请输入项目名称"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>项目说明</label>
            <textarea
              className="form-textarea"
              placeholder="请输入项目说明（可选）"
              value={newProjectDesc}
              onChange={(e) => setNewProjectDesc(e.target.value)}
              rows={3}
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowCreateModal(false)
                setNewProjectName('')
                setNewProjectDesc('')
              }}
            >
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateProject}
              disabled={isCreating || !newProjectName.trim()}
            >
              {isCreating ? '创建中...' : '创建项目'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default App