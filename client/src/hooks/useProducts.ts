import { useState, useCallback, useEffect } from 'react'
import { WorkProduct } from '../types'

interface UseProductsOptions {
  sessionId?: string
  ws: WebSocket | null
}

export function useProducts({ sessionId, ws }: UseProductsOptions) {
  const [products, setProducts] = useState<WorkProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 处理接收到的产物
  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'products_loaded':
        // 产物列表加载完成
        if (data.products) {
          setProducts(data.products.map((p: any) => ({
            ...p,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          })))
        }
        break

      case 'product_created':
        // 新产物创建
        if (data.product) {
          setProducts(prev => [data.product, ...prev])
        }
        break
    }
  }, [])

  // 订阅WebSocket消息
  useEffect(() => {
    if (!ws) return

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        handleMessage(data)
      } catch (e) {
        console.error('[useProducts] Parse error:', e)
      }
    }

    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, handleMessage])

  // 加载产物
  const loadProducts = useCallback(() => {
    if (!sessionId || !ws) return

    setIsLoading(true)
    ws.send(JSON.stringify({
      type: 'load_products',
      sessionId
    }))
    setIsLoading(false)
  }, [sessionId, ws])

  // 手动刷新产物列表
  const refresh = useCallback(() => {
    loadProducts()
  }, [loadProducts])

  // 清空产物
  const clearProducts = useCallback(() => {
    setProducts([])
  }, [])

  return {
    products,
    isLoading,
    loadProducts,
    refresh,
    clearProducts
  }
}