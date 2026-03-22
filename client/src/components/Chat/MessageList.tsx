import { useRef, useEffect } from 'react'
import { Message } from '../../types'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: Message[]
  hasMore?: boolean
  onLoadMore?: () => void
  isLoading?: boolean
  thinkingStatus?: { stage: string; content: string } | null
}

export function MessageList({ messages, hasMore, onLoadMore, isLoading, thinkingStatus }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldScrollRef = useRef(true)
  const isAtTopRef = useRef(false)

  // 自动滚动到底部
  useEffect(() => {
    if (shouldScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages.length])

  // 处理滚动事件，用于加载更多
  const handleScroll = () => {
    if (!containerRef.current) return

    const { scrollTop } = containerRef.current

    // 记录是否滚动到顶部
    isAtTopRef.current = scrollTop === 0

    // 只有在滚动到顶部且有更多消息时才加载
    if (isAtTopRef.current && hasMore && onLoadMore && !isLoading) {
      shouldScrollRef.current = false
      onLoadMore()
    }
  }

  // 用户手动滚动时，允许自动滚动
  const handleUserScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    // 如果滚动到底部，启用自动滚动
    if (scrollHeight - scrollTop - clientHeight < 100) {
      shouldScrollRef.current = true
    }
  }

  const handleScrollWrapper = () => {
    handleScroll()
    handleUserScroll()
  }

  return (
    <div
      className="message-list"
      ref={containerRef}
      onScroll={handleScrollWrapper}
    >
      {/* 消息列表 */}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Agent 工作状态卡片 - 极简单行样式 */}
      {thinkingStatus && (
        <div className="thinking-status-card">
          <span className="thinking-status-icon">🤔</span>
          <div className="thinking-status-content">
            <span className="thinking-status-title">{thinkingStatus.stage}:</span>
            <span className="thinking-status-text">{thinkingStatus.content}</span>
          </div>
        </div>
      )}

      {messages.length === 0 && (
        <div className="empty-messages">
          暂无消息，开始对话吧
        </div>
      )}
    </div>
  )
}