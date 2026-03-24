import { Message, AGENT_CONFIG } from '../../types'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // 系统消息渲染 - 居中卡片样式
  if (isSystem) {
    return (
      <div className="message-bubble message-system">
        <div className="message-system-content">
          {message.content}
        </div>
      </div>
    )
  }

  // 获取Agent配置（适配新架构：使用 sourceAgent）
  const agentConfig = message.sourceAgent ? AGENT_CONFIG[message.sourceAgent] : null
  const displayName = isUser ? '用户' : (agentConfig?.name || '智能秘书')
  const color = agentConfig?.color || '#6b7280'

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`message-bubble ${isUser ? 'message-user' : 'message-agent'}`}>
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