import { useState, useRef, KeyboardEvent } from 'react'

interface MessageInputProps {
  onSend: (content: string) => void
  onAttach?: () => void
  onCommand?: () => void
  disabled?: boolean
  isUploading?: boolean
  placeholder?: string
  tokenUsage?: { used: number; total: number }
}

export function MessageInput({
  onSend,
  onAttach,
  onCommand,
  disabled,
  isUploading,
  placeholder = '输入消息...',
  tokenUsage
}: MessageInputProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const trimmed = content.trim()
    if (!trimmed || disabled) return

    onSend(trimmed)
    setContent('')

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 自动调整 textarea 高度
  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }

  // 计算 token 使用百分比
  const tokenPercent = tokenUsage
    ? Math.round((tokenUsage.used / tokenUsage.total) * 100)
    : 0

  return (
    <div className="message-input-container">
      {/* 输入框独占一行 */}
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          className="message-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
        />
      </div>

      {/* 功能按钮 + 发送按钮同一行 */}
      <div className="input-actions-row">
        {/* 左侧按钮组 */}
        <div className="action-buttons-left">
          {/* 附件上传 */}
          <button
            className="action-btn"
            onClick={onAttach}
            disabled={disabled || isUploading}
            title={isUploading ? '上传中...' : '上传小说文件'}
          >
            {isUploading ? (
              <span className="upload-spinner">⏳</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            )}
            <span>{isUploading ? '上传中' : '附件'}</span>
          </button>

          {/* 指令按钮 - /符号 */}
          <button
            className="action-btn"
            onClick={onCommand}
            disabled={disabled}
            title="指令模式 (预留)"
          >
            <span className="command-icon">/</span>
            <span>指令</span>
          </button>

          {/* 上下文状态 */}
          <div className="context-status" title="上下文 token 使用情况">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {tokenUsage ? (
              <span className="token-usage">
                {tokenUsage.used.toLocaleString()} / {tokenUsage.total.toLocaleString()}
                <span className="token-percent">({tokenPercent}%)</span>
              </span>
            ) : (
              <span className="token-usage">上下文</span>
            )}
          </div>
        </div>

        {/* 发送按钮 - 右对齐 */}
        <button
          onClick={handleSend}
          disabled={disabled || !content.trim()}
          className="send-button"
          title="发送 (Enter)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  )
}