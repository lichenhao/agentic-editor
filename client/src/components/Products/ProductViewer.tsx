import { WorkProduct, AGENT_CONFIG } from '../../types'

interface ProductViewerProps {
  product: WorkProduct | null
  onClose: () => void
}

export function ProductViewer({ product, onClose }: ProductViewerProps) {
  if (!product) return null

  const agentConfig = product.creatorAgentId ? AGENT_CONFIG[product.creatorAgentId] : null

  // 渲染内容
  const renderContent = () => {
    // 如果有content直接显示
    if (product.content) {
      // JSON 格式化显示
      if (product.type === 'JSON') {
        try {
          const json = JSON.parse(product.content)
          return (
            <pre className="product-content-json">
              {JSON.stringify(json, null, 2)}
            </pre>
          )
        } catch {
          return <div className="product-content">{product.content}</div>
        }
      }
      return <div className="product-content">{product.content}</div>
    }

    // 如果是图片
    if (product.type === 'IMAGE') {
      return (
        <div className="product-image-placeholder">
          <span>🖼️</span>
          <p>图片: {product.name}</p>
        </div>
      )
    }

    // 如果是视频
    if (product.type === 'VIDEO') {
      return (
        <div className="product-video-placeholder">
          <span>🎬</span>
          <p>视频: {product.name}</p>
        </div>
      )
    }

    return (
      <div className="product-empty">
        <span>📦</span>
        <p>无预览内容</p>
      </div>
    )
  }

  return (
    <div className="product-viewer-overlay" onClick={onClose}>
      <div className="product-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="product-viewer-header">
          <div className="product-viewer-title">
            <span className="product-type-icon">
              {product.type === 'IMAGE' ? '🖼️' :
               product.type === 'VIDEO' ? '🎬' :
               product.type === 'JSON' ? '📋' : '📄'}
            </span>
            <h3>{product.name}</h3>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="product-viewer-body">
          {renderContent()}
        </div>

        <div className="product-viewer-footer">
          <div className="product-meta-info">
            {agentConfig && (
              <span className="creator">
                {agentConfig.avatar} {agentConfig.name}
              </span>
            )}
            <span className="date">
              {new Date(product.createdAt).toLocaleString('zh-CN')}
            </span>
          </div>
          {product.description && (
            <p className="product-description">{product.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}