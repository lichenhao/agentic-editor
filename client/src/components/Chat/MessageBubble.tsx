import { Message, AGENT_CONFIG } from '../../types'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // 获取Agent配置
  const agentConfig = message.employeeId ? AGENT_CONFIG[message.employeeId] : null
  const displayName = isUser ? '用户' : (agentConfig?.name || 'Agent')
  const avatar = isUser ? '👤' : (agentConfig?.avatar || '🤖')
  const color = agentConfig?.color || '#6b7280'

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`message-bubble ${isUser ? 'message-user' : 'message-agent'}`}>
      <div className="message-avatar" style={{ backgroundColor: isUser ? '#6b7280' : color }}>
        {avatar}
      </div>
      <div className="message-content-wrapper">
        <div className="message-header">
          <span className="message-author" style={{ color }}>
            {displayName}
          </span>
          <span className="message-time">{formatTime(message.createdAt)}</span>
        </div>
        <div className="message-content">
          {message.content}
        </div>
      </div>
    </div>
  )
}