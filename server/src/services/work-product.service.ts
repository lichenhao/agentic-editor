import { prisma } from '../infrastructure/database/prisma'
import { ProductType } from '@prisma/client'

// 工作产物类型定义
export interface CreateWorkProductParams {
  projectId: string
  sessionId: string
  type: ProductType
  name: string
  description?: string
  mimeType?: string
  content?: string      // 小内容直接存数据库
  storageKey?: string   // 大内容存本地
  sourceMessageId?: string
  creatorAgentId?: string
  metadata?: any
}

// 创建工作产物
export async function createWorkProduct(params: CreateWorkProductParams) {
  const product = await prisma.workProduct.create({
    data: {
      projectId: params.projectId,
      sessionId: params.sessionId,
      type: params.type,
      name: params.name,
      description: params.description,
      mimeType: params.mimeType,
      content: params.content,
      storageKey: params.storageKey,
      sourceMessageId: params.sourceMessageId,
      creatorAgentId: params.creatorAgentId,
      metadata: params.metadata
    }
  })

  return product
}

// 根据 sessionId 获取工作产物列表
export async function getProductsBySession(sessionId: string) {
  return await prisma.workProduct.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' }
  })
}

// 根据 projectId 获取工作产物列表
export async function getProductsByProject(projectId: string) {
  return await prisma.workProduct.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' }
  })
}

// 根据 ID 获取单个产物
export async function getProductById(id: string) {
  return await prisma.workProduct.findUnique({
    where: { id }
  })
}

// 更新产物
export async function updateProduct(id: string, data: Partial<CreateWorkProductParams>) {
  return await prisma.workProduct.update({
    where: { id },
    data
  })
}

// 删除产物
export async function deleteProduct(id: string) {
  return await prisma.workProduct.delete({
    where: { id }
  })
}

// 获取产物数量
export async function getProductCount(sessionId?: string, projectId?: string) {
  const where: any = {}
  if (sessionId) where.sessionId = sessionId
  if (projectId) where.projectId = projectId

  return await prisma.workProduct.count({ where })
}