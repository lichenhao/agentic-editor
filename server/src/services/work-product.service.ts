/**
 * WorkProduct Service - 工作产出物管理服务
 * 负责记录和管理 Agent 产出物
 */

import { prisma } from '../infrastructure/database/prisma'
import { ProductType } from '@prisma/client'

export interface CreateProductParams {
  sessionId: string
  taskId?: string
  agentType: string
  type: ProductType
  name: string
  content?: string
  storageKey?: string
  metadata?: Record<string, any>
  acceptanceStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  acceptanceNote?: string
}

export interface ProductWithRelations {
  id: string
  sessionId: string
  taskId: string | null
  agentType: string
  type: ProductType
  name: string
  content: string | null
  storageKey: string | null
  metadata: any
  acceptanceStatus: string | null
  acceptanceNote: string | null
  createdAt: Date
}

export class WorkProductService {

  /**
   * 创建工作产出物
   */
  async createProduct(params: CreateProductParams): Promise<ProductWithRelations> {
    const product = await prisma.workProduct.create({
      data: {
        sessionId: params.sessionId,
        taskId: params.taskId,
        agentType: params.agentType,
        type: params.type,
        name: params.name,
        content: params.content,
        storageKey: params.storageKey,
        metadata: params.metadata,
        acceptanceStatus: params.acceptanceStatus || 'PENDING'
      }
    })

    console.log(`[WorkProduct] Created: ${product.id}, type: ${product.type}, name: ${product.name}`)

    return product as ProductWithRelations
  }

  /**
   * 批量创建工作产出物
   */
  async createProducts(params: CreateProductParams[]): Promise<ProductWithRelations[]> {
    if (params.length === 0) return []

    const products = await prisma.workProduct.createManyAndReturn({
      data: params.map(p => ({
        sessionId: p.sessionId,
        taskId: p.taskId,
        agentType: p.agentType,
        type: p.type,
        name: p.name,
        content: p.content,
        storageKey: p.storageKey,
        metadata: p.metadata,
        acceptanceStatus: p.acceptanceStatus || 'PENDING'
      }))
    })

    return products as ProductWithRelations[]
  }

  /**
   * 获取会话的所有产出物
   */
  async getSessionProducts(sessionId: string): Promise<ProductWithRelations[]> {
    return prisma.workProduct.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    }) as Promise<ProductWithRelations[]>
  }

  /**
   * 获取任务的所有产出物
   */
  async getTaskProducts(taskId: string): Promise<ProductWithRelations[]> {
    return prisma.workProduct.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' }
    }) as Promise<ProductWithRelations[]>
  }

  /**
   * 获取单个产出物
   */
  async getProduct(productId: string): Promise<ProductWithRelations | null> {
    return prisma.workProduct.findUnique({
      where: { id: productId }
    }) as Promise<ProductWithRelations | null>
  }

  /**
   * 更新产出物
   */
  async updateProduct(
    productId: string,
    data: {
      name?: string
      content?: string
      storageKey?: string
      metadata?: Record<string, any>
      acceptanceStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
      acceptanceNote?: string
    }
  ): Promise<ProductWithRelations> {
    return prisma.workProduct.update({
      where: { id: productId },
      data
    }) as Promise<ProductWithRelations>
  }

  /**
   * 删除产出物
   */
  async deleteProduct(productId: string): Promise<void> {
    await prisma.workProduct.delete({
      where: { id: productId }
    })
  }

  /**
   * 删除任务的所有产出物
   */
  async deleteTaskProducts(taskId: string): Promise<number> {
    const result = await prisma.workProduct.deleteMany({
      where: { taskId }
    })
    return result.count
  }

  /**
   * 验收通过
   */
  async approveProduct(productId: string, note?: string): Promise<ProductWithRelations> {
    return this.updateProduct(productId, {
      acceptanceStatus: 'APPROVED',
      acceptanceNote: note
    })
  }

  /**
   * 验收拒绝
   */
  async rejectProduct(productId: string, note: string): Promise<ProductWithRelations> {
    return this.updateProduct(productId, {
      acceptanceStatus: 'REJECTED',
      acceptanceNote: note
    })
  }

  /**
   * 按类型获取产出物
   */
  async getProductsByType(sessionId: string, type: ProductType): Promise<ProductWithRelations[]> {
    return prisma.workProduct.findMany({
      where: { sessionId, type },
      orderBy: { createdAt: 'asc' }
    }) as Promise<ProductWithRelations[]>
  }

  /**
   * 统计产出物数量
   */
  async countProducts(sessionId: string): Promise<Record<string, number>> {
    const products = await prisma.workProduct.findMany({
      where: { sessionId },
      select: { type: true }
    })

    const counts: Record<string, number> = {}
    for (const p of products) {
      counts[p.type] = (counts[p.type] || 0) + 1
    }

    return counts
  }
}

export const workProductService = new WorkProductService()