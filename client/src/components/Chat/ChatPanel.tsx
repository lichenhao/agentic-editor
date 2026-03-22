import { Message } from '../../types'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'

interface ChatPanelProps {
  messages: Message[]
  onSendMessage: (content: string) => void
  onLoadMore?: () => void
  onAttach?: () => void
  onCommand?: () => void
  hasMore?: boolean
  isLoading?: boolean
  isConnected?: boolean
  isUploading?: boolean
  disabled?: boolean
  tokenUsage?: { used: number; total: number }
}

export function ChatPanel({
  messages,
  onSendMessage,
  onLoadMore,
  onAttach,
  onCommand,
  hasMore,
  isLoading,
  isConnected,
  isUploading,
  disabled,
  tokenUsage
}: ChatPanelProps) {
  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>群聊</h2>
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '已连接' : '未连接'}
        </span>
      </div>

      <MessageList
        messages={messages}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        isLoading={isLoading}
      />

      <MessageInput
        onSend={onSendMessage}
        onAttach={onAttach}
        onCommand={onCommand}
        disabled={disabled || !isConnected || isUploading}
        isUploading={isUploading}
        placeholder={isConnected ? '输入消息，按 Enter 发送...' : '连接中...'}
        tokenUsage={tokenUsage}
      />
    </div>
  )
}