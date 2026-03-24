import { WorkProduct, AGENT_CONFIG, ProductType } from '../../types'

interface ProductCardProps {
  product: WorkProduct
  onClick?: (product: WorkProduct) => void
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const agentConfig = product.agentType ? AGENT_CONFIG[product.agentType] : null

  // 根据类型获取图标
  const getTypeIcon = (type: ProductType) => {
    switch (type) {
      case 'IMAGE': return '🖼️'
      case 'VIDEO': return '🎬'
      case 'TEXT': return '📄'
      case 'CODE': return '💻'
      case 'FILE': return '📁'
      case 'DATA': return '📊'
      default: return '📦'
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="product-card" onClick={() => onClick?.(product)}>
      <div className="product-icon">
        {getTypeIcon(product.type)}
      </div>
      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-meta">
          {agentConfig && <span className="product-agent">{agentConfig.avatar}</span>}
          <span className="product-date">{formatDate(product.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}