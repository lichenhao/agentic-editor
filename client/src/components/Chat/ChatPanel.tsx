import { Message } from '../../types'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { TaskProgressDrawer, TaskInfo } from '../Task/TaskProgressDrawer'

interface ChatPanelProps {
  messages: Message[]
  onSendMessage: (content: string) => void
  onLoadMore?: () => void
  onAttach?: () => void
  onCommand?: () => void
  onToggleLeft?: () => void
  onToggleRight?: () => void
  hasMore?: boolean
  isLoading?: boolean
  isConnected?: boolean
  isUploading?: boolean
  disabled?: boolean
  tokenUsage?: { used: number; total: number }
  attachedFile?: { name: string; status: 'uploading' | 'ready' | 'error' } | null
  sessionTitle?: string
  tasks?: TaskInfo[]
}

export function ChatPanel({
  messages,
  onSendMessage,
  onLoadMore,
  onAttach,
  onCommand,
  onToggleLeft,
  onToggleRight,
  hasMore,
  isLoading,
  isConnected,
  isUploading,
  disabled,
  tokenUsage,
  attachedFile,
  sessionTitle = 'AI 短剧助手',
  tasks = []
}: ChatPanelProps) {
  return (
    <div className="chat-panel">
      <div className="chat-header">
        {/* 左侧栏切换按钮 */}
        <button className="header-toggle-btn" onClick={onToggleLeft} title="项目列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>

        {/* 中间：标题 + 状态 */}
        <div className="chat-header-center">
          <h2>{sessionTitle}</h2>
          <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} title={isConnected ? '已连接' : '未连接'} />
        </div>

        {/* 右侧栏切换按钮 */}
        <button className="header-toggle-btn" onClick={onToggleRight} title="工作产物">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        </button>
      </div>

      <MessageList
        messages={messages}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        isLoading={isLoading}
      />

      {/* 任务进度抽屉 - 仅在有待办任务时显示 */}
      {tasks.length > 0 && <TaskProgressDrawer tasks={tasks} />}

      <MessageInput
        onSend={onSendMessage}
        onAttach={onAttach}
        onCommand={onCommand}
        disabled={disabled || !isConnected || isUploading}
        isUploading={isUploading}
        placeholder={isConnected ? '输入消息，按 Enter 发送...' : '连接中...'}
        tokenUsage={tokenUsage}
        attachedFile={attachedFile}
      />
    </div>
  )
}