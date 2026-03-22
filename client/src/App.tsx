import { useState, useEffect, useCallback, useRef } from 'react'
import { sessionApi, productApi, messageApi, uploadApi } from './services/api'
import { getInstance, onMessage, send, onConnectionChange, loadSessionData } from './services/ws-singleton'
import { ChatPanel } from './components/Chat/ChatPanel'
import { Modal } from './components/Layout/Modal'
import { Message, WorkProduct, Session } from './types'
import { TaskInfo } from './components/Task/TaskProgressDrawer'
import './styles/design-tokens.css'
import './styles/global.css'
import './App.css'

function App() {
  // ============ 防重复加载 ============
  const initializedRef = useRef(false)

  // ============ 布局状态 ============
  // left: 左中布局, right: 中右布局, none: 只显示中间
  const [layout, setLayout] = useState<'left' | 'right' | 'none'>('none')

  // ============ 状态管理 ============
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)

  // 消息状态
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(true)

  // 产物状态 (使用 HTTP 加载)
  const [products, setProducts] = useState<WorkProduct[]>([])

  // 弹窗状态
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // 文件上传状态
  const [isUploading, setIsUploading] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ name: string; status: 'uploading' | 'ready' | 'error' } | null>(null)

  // WebSocket 状态（从单例获取）
  const [isConnected, setIsConnected] = useState(false)

  // 任务状态
  const [tasks, setTasks] = useState<TaskInfo[]>([])

  // Agent 思考状态（用于显示状态卡片）
  const [thinkingStatus, setThinkingStatus] = useState<{ stage: string; content: string } | null>(null)

  // ============ 从 URL 获取 sessionId ============
  const getSessionIdFromUrl = useCallback((): string | null => {
    // 支持 /chat/:sessionId 或 ?session=:sessionId
    const path = window.location.pathname
    const match = path.match(/\/chat\/(.+)/)
    if (match) return match[1]

    const params = new URLSearchParams(window.location.search)
    return params.get('session')
  }, [])

  // ============ 根据 sessionId 加载数据 ============
  const loadSessionById = useCallback(async (sessionId: string) => {
    // 查找 session 对象
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
    }

    // 使用单例加载数据
    await loadSessionData(sessionId, {
      onMessages: (msgs) => {
        setMessages(msgs)
      },
      onProducts: (prods) => {
        setProducts(prods)
      },
      onSessions: (sessList) => {
        setSessions(sessList)
        // 如果没找到 session，尝试从加载的列表中找
        if (!session && sessList.length > 0) {
          const found = sessList.find((s: Session) => s.id === sessionId)
          if (found) setCurrentSession(found)
        }
      }
    })

    // 建立 WebSocket 连接（单例会自动处理复用）
    getInstance(sessionId)
  }, [sessions])

  // ============ 初始化 ============
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const sessionId = getSessionIdFromUrl()

    if (sessionId) {
      // URL 有 sessionId，先加载会话列表（用于侧边栏显示）
      // 然后加载指定 session 的数据
      sessionApi.history().then(data => {
        if (data.sessions) {
          setSessions(data.sessions)
          loadSessionById(sessionId)
        }
      }).catch(err => {
        console.error('Failed to load sessions:', err)
        // 即使会话列表加载失败，也尝试加载指定 session
        loadSessionById(sessionId)
      })
    }
    // URL 无 sessionId → 空白首页，不加载任何数据
  }, [getSessionIdFromUrl, loadSessionById])

  // ============ WebSocket 消息处理 ============
  useEffect(() => {
    // 注册消息处理器
    const unsubscribe = onMessage((data: any) => {
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
          // Agent 正在工作中，显示状态卡片
          if (data.content) {
            setThinkingStatus({
              stage: data.stage || '思考中',
              content: data.content
            })
          }
          break

        case 'message':
          // 收到 Agent 消息 - 只有包含有效内容才渲染
          console.log('[WS] Received message:', data)
          if (data.id && data.content) {
            setMessages(prev => {
              const newMsg: Message = {
                id: data.id,
                role: data.role || 'assistant',
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
          }
          break

        case 'done':
          // 完成，隐藏状态卡片 - 不渲染到消息列表
          console.log('[WS] Received done:', data)
          setThinkingStatus(null)
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

        case 'task_progress':
          // 更新任务进度百分比
          setTasks(prev => prev.map(t =>
            t.id === data.taskId
              ? { ...t, progress: data.progress, progressMessage: data.message }
              : t
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
    })

    // 注册连接状态变化
    const unsubscribeConnection = onConnectionChange((connected) => {
      setIsConnected(connected)
    })

    return () => {
      unsubscribe()
      unsubscribeConnection()
    }
  }, [])

  // ============ 选择会话 ============
  const selectSession = useCallback(async (session: Session) => {
    // 已经是当前会话，不做处理
    if (currentSession?.id === session.id) return

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

    // 切换 session - 单例会发送 join_session 消息
    getInstance(session.id)
  }, [currentSession])

  // ============ 创建新会话 (HTTP) ============
  const createSession = async () => {
    try {
      const data = await sessionApi.create(undefined, `新项目_${Date.now()}`)
      if (data.session) {
        // 更新 URL
        window.history.pushState(null, '', `/chat/${data.session.id}`)

        await loadSessionById(data.session.id)
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

        // 更新 URL
        window.history.pushState(null, '', `/chat/${data.session.id}`)

        // 加载新会话数据
        await loadSessionById(data.session.id)

        // 刷新会话列表
        const historyRes = await sessionApi.history()
        if (historyRes.sessions) {
          setSessions(historyRes.sessions)
        }
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
        // 清除 URL
        window.history.pushState(null, '', '/')
      }
      // 刷新会话列表
      const historyRes = await sessionApi.history()
      if (historyRes.sessions) {
        setSessions(historyRes.sessions)
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // ============ 发送消息 (WS) ============
  const handleSendMessage = useCallback((content: string) => {
    // 如果没有当前会话，需要先创建
    if (!currentSession) {
      // 自动创建会话
      createSession().then(() => {
        // 延迟一点等待会话创建完成
        setTimeout(() => {
          send('message', { content })
        }, 100)
      })
      return
    }

    const success = send('message', { content, sessionId: currentSession.id })
    if (!success) {
      console.warn('[Chat] Failed to send message')
    }

    // 发送消息后清除附件状态
    setAttachedFile(null)
  }, [currentSession])

  // ============ 加载更多消息 (WS) ============
  const handleLoadMore = useCallback(() => {
    if (!hasMore || !currentSession) return

    const oldestMsg = messages[0]
    if (oldestMsg) {
      send('load_history', {
        sessionId: currentSession.id,
        before: oldestMsg.id,
        limit: 50
      })
    }
  }, [hasMore, currentSession, messages])

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

  // ============ 渲染 ============
  const metadata = currentSession?.metadata as any
  const projectName = metadata?.projectName || '未命名项目'

  return (
    <>
      {/* 左侧栏 - 项目列表 (左中布局时显示) */}
      {layout === 'left' && (
        <aside className="aside-left">
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
          </div>
          <button className="new-project-btn" onClick={() => setShowCreateModal(true)}>
            + 新建项目
          </button>
        </aside>
      )}

      {/* 中间 - 聊天区域 (始终显示) */}
      <main className={`app-main ${layout === 'right' ? 'app-main-narrow' : ''}`}>
        {currentSession ? (
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            onLoadMore={handleLoadMore}
            onAttach={handleAttach}
            hasMore={hasMore}
            isConnected={isConnected}
            isUploading={isUploading}
            tokenUsage={{ used: 4000, total: 100000 }}
            attachedFile={attachedFile}
            sessionTitle={projectName}
            tasks={tasks}
            thinkingStatus={thinkingStatus}
            onToggleLeft={() => setLayout(layout === 'left' ? 'none' : 'left')}
            onToggleRight={() => setLayout(layout === 'right' ? 'none' : 'right')}
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
      </main>

      {/* 右侧栏 - 工作产物 (中右布局时显示) */}
      {layout === 'right' && products.length > 0 && (
        <aside className="aside-right">
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
        </aside>
      )}

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
    </>
  )
}

export default App