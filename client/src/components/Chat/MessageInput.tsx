import { useState, useRef, KeyboardEvent } from 'react'

interface MessageInputProps {
  onSend: (content: string) => void
  onAttach?: () => void
  onCommand?: () => void
  disabled?: boolean
  isUploading?: boolean
  placeholder?: string
  tokenUsage?: { used: number; total: number }
  attachedFile?: { name: string; status: 'uploading' | 'ready' | 'error' } | null
}

export function MessageInput({
  onSend,
  onAttach,
  onCommand,
  disabled,
  isUploading,
  placeholder = '输入消息...',
  tokenUsage,
  attachedFile
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
          {/* 附件上传 - + 图标 */}
          <button
            className="action-btn"
            onClick={onAttach}
            disabled={disabled || isUploading}
            title={isUploading ? '上传中...' : '上传文件'}
          >
            {isUploading ? (
              <span className="upload-spinner">⏳</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </button>

          {/* 指令按钮 - / 图标 */}
          <button
            className="action-btn"
            onClick={onCommand}
            disabled={disabled}
            title="指令模式 (预留)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM9 9h6M9 12h6M9 15h6" />
            </svg>
          </button>

          {/* 分割线 */}
          <span className="action-divider">|</span>

          {/* 上下文状态 - 环形百分比图标 */}
          <div className="context-status" title="上下文 token 使用情况">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            {tokenUsage ? (
              <span className="token-usage">{tokenPercent}%</span>
            ) : (
              <span className="token-usage">-</span>
            )}
          </div>

          {/* 文件附件指示器 */}
          {attachedFile && (
            <div
              className={`attachment-indicator ${attachedFile.status}`}
              title={attachedFile.status === 'uploading' ? '上传中...' : attachedFile.status === 'ready' ? `已上传: ${attachedFile.name}` : '上传失败'}
            >
              {attachedFile.status === 'uploading' ? (
                <span className="upload-spinner-small">⏳</span>
              ) : attachedFile.status === 'ready' ? (
                <span className="file-icon">📎</span>
              ) : (
                <span className="file-icon error">⚠️</span>
              )}
              <span className="file-name">{attachedFile.name}</span>
            </div>
          )}
        </div>

        {/* 发送按钮 - 右对齐，使用向上箭头 */}
        <button
          onClick={handleSend}
          disabled={disabled || !content.trim()}
          className="send-button"
          title="发送 (Enter)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}