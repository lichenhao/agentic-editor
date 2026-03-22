import { useState } from 'react'
import { WorkProduct } from '../../types'
import { ProductGrid } from './ProductGrid'
import { ProductViewer } from './ProductViewer'

interface ProductPanelProps {
  products: WorkProduct[]
  onRefresh?: () => void
  isLoading?: boolean
}

export function ProductPanel({ products, onRefresh, isLoading }: ProductPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<WorkProduct | null>(null)

  return (
    <div className={`product-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* 标题栏 */}
      <div className="product-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>工作产物</h3>
        <span className="product-count">{products.length}</span>
        <span className="expand-icon">{isExpanded ? '▼' : '◀'}</span>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="product-panel-content">
          {/* 刷新按钮 */}
          <div className="product-panel-actions">
            <button onClick={onRefresh} disabled={isLoading}>
              {isLoading ? '加载中...' : '🔄 刷新'}
            </button>
          </div>

          {/* 产物列表 */}
          <ProductGrid
            products={products}
            onProductClick={setSelectedProduct}
          />
        </div>
      )}

      {/* 产物预览弹窗 */}
      <ProductViewer
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  )
}