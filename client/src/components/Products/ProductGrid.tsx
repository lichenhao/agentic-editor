import { WorkProduct } from '../../types'
import { ProductCard } from './ProductCard'

interface ProductGridProps {
  products: WorkProduct[]
  onProductClick?: (product: WorkProduct) => void
}

export function ProductGrid({ products, onProductClick }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="products-empty">
        <span className="empty-icon">📦</span>
        <p>暂无工作产物</p>
      </div>
    )
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onClick={onProductClick}
        />
      ))}
    </div>
  )
}