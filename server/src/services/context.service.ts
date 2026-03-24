/**
 * Context Service - 上下文管理服务
 * 管理会话上下文记录
 */

import { prisma } from '../infrastructure/database/prisma'

export interface AddContextParams {
  sessionId: string
  role: 'user' | 'assistant' | 'agent' | 'system'
  sourceAgent?: string
  content: string
  metadata?: any
  productId?: string
}

export interface GetContextsOptions {
  limit?: number
  offset?: number
  role?: string
}

class ContextService {

  /**
   * 添加上下文记录
   */
  async addContext(params: AddContextParams): Promise<any> {
    const { sessionId, role, sourceAgent, content, metadata, productId } = params

    return prisma.context.create({
      data: {
        sessionId,
        role,
        sourceAgent,
        content,
        metadata,
        productId
      }
    })
  }

  /**
   * 获取会话上下文
   */
  async getContexts(sessionId: string, options: GetContextsOptions = {}): Promise<any[]> {
    const { limit = 50, offset = 0, role } = options

    return prisma.context.findMany({
      where: {
        sessionId,
        ...(role ? { role } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    })
  }

  /**
   * 获取最新的上下文
   */
  async getLatestContext(sessionId: string): Promise<any | null> {
    return prisma.context.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * 删除会话的上下文
   */
  async clearContexts(sessionId: string): Promise<void> {
    await prisma.context.deleteMany({
      where: { sessionId }
    })
  }
}

export const contextService = new ContextService()