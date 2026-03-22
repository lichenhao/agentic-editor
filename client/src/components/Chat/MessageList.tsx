import { useRef, useEffect } from 'react'
import { Message } from '../../types'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: Message[]
  hasMore?: boolean
  onLoadMore?: () => void
  isLoading?: boolean
}

export function MessageList({ messages, hasMore, onLoadMore, isLoading }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldScrollRef = useRef(true)

  // 自动滚动到底部
  useEffect(() => {
    if (shouldScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages.length])

  // 处理滚动事件，用于加载更多
  const handleScroll = () => {
    if (!containerRef.current || !hasMore || isLoading) return

    const { scrollTop } = containerRef.current
    // 滚动到顶部时加载更多
    if (scrollTop < 50 && onLoadMore) {
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
      {/* 加载更多提示 */}
      {hasMore && (
        <div className="load-more" onClick={onLoadMore}>
          {isLoading ? '加载中...' : '点击加载更多'}
        </div>
      )}

      {/* 消息列表 */}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {messages.length === 0 && (
        <div className="empty-messages">
          暂无消息，开始对话吧
        </div>
      )}
    </div>
  )
}