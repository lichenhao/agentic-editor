import { useState, useRef } from 'react'
import { uploadApi } from '../../services/api'

interface FileUploaderProps {
  onUploadComplete?: (result: UploadResult) => void
}

interface UploadResult {
  id: string
  fileName: string
  size: number
  chunkCount: number
  isExisting: boolean
  chapters?: ChapterInfo[]
}

interface ChapterInfo {
  id: string
  title: string
  chunkCount: number
}

export function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const validTypes = ['text/plain', 'text/markdown', 'application/pdf', 'application/octet-stream']
    const validExtensions = ['.txt', '.md', '.pdf']
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setError('请上传文本文件 (.txt, .md) 或 PDF 文件')
      return
    }

    setIsUploading(true)
    setError(null)
    setUploadProgress(0)
    setUploadResult(null)

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const result = await uploadApi.upload(file)

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (result.error) {
        setError(result.error)
      } else {
        setUploadResult({
          id: result.id,
          fileName: result.fileName,
          size: result.size,
          chunkCount: result.chunkCount,
          isExisting: result.isExisting,
          chapters: result.chapters
        })
        onUploadComplete?.(result)
      }
    } catch (err: any) {
      setError(err.message || '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && fileInputRef.current) {
      const dt = new DataTransfer()
      dt.items.add(file)
      fileInputRef.current.files = dt.files
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const resetUploader = () => {
    setUploadResult(null)
    setError(null)
    setUploadProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="file-uploader">
      {!uploadResult ? (
        <div
          className={`upload-zone ${isUploading ? 'uploading' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {isUploading ? (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="progress-text">上传中... {uploadProgress}%</span>
            </div>
          ) : (
            <div className="upload-placeholder">
              <span className="upload-icon">📄</span>
              <p>点击或拖拽小说文件到此处上传</p>
              <span className="upload-hint">支持 .txt, .md, .pdf 格式</span>
            </div>
          )}

          {error && <div className="upload-error">{error}</div>}
        </div>
      ) : (
        <div className="upload-result">
          <div className="result-header">
            <span className="result-icon">{uploadResult.isExisting ? '📚' : '✨'}</span>
            <div className="result-info">
              <h4>{uploadResult.fileName}</h4>
              <span className="result-meta">
                {formatFileSize(uploadResult.size)} · {uploadResult.chunkCount} 个分片
              </span>
            </div>
            <button className="reset-btn" onClick={resetUploader}>×</button>
          </div>

          {uploadResult.chapters && uploadResult.chapters.length > 0 && (
            <div className="chapter-list">
              <h5>章节信息 ({uploadResult.chapters.length} 章)</h5>
              <ul>
                {uploadResult.chapters.map((chapter, idx) => (
                  <li key={chapter.id || idx}>
                    <span className="chapter-title">{chapter.title}</span>
                    <span className="chapter-chunks">{chapter.chunkCount} 分片</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="result-actions">
            <button className="btn-primary" onClick={resetUploader}>
              上传新文件
            </button>
          </div>
        </div>
      )}
    </div>
  )
}