import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../infrastructure/database/prisma'
import { ProjectAgentService } from '../../agents/service/project-agent.service'
import * as workProductService from '../../services/work-product.service'

// 默认 Agent 类型 - 只使用 director
const DEFAULT_AGENTS = ['director']

// 有效的 Project 状态
type ProjectStatus = 'INITIALIZING' | 'CHUNKING' | 'ANALYZING' | 'ASSET_GENERATION' | 'STORYBOARDING' | 'PRODUCING' | 'EDITING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVISION'

export async function chatRoutes(fastify: FastifyInstance) {
  const userId = 'default-user' // For POC, use default user

  // Create new session
  fastify.post('/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { agentId, projectName } = request.body as { agentId?: string; projectName?: string }

      // 确保用户存在
      let user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        user = await prisma.user.create({
          data: { id: userId, email: `${userId}@example.com` }
        })
      }

      const effectiveAgentId = agentId || 'director'

      // 1. 创建项目
      const project = await prisma.project.create({
        data: {
          name: projectName || `项目_${new Date().toISOString()}`,
          userId,
          status: 'INITIALIZING' as ProjectStatus
        }
      })

      // 2. 为项目分配默认 Agent（director, manager）
      for (const agentType of DEFAULT_AGENTS) {
        await ProjectAgentService.assignAgent(project.id, agentType)
      }

      // 3. 创建会话，关联主 Agent
      const session = await prisma.session.create({
        data: {
          userId,
          agentId: effectiveAgentId,
          status: 'ACTIVE',
          metadata: {
            projectId: project.id,
            projectName: project.name
          }
        }
      })

      // 4. 获取项目的 Agent 绑定信息
      const projectAgents = await ProjectAgentService.getProjectAgents(project.id)

      return reply.send({
        session,
        project,
        projectAgents
      })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // Get session by ID
  fastify.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const session = await prisma.session.findUnique({
          where: { id: request.params.sessionId },
          include: {
            contexts: {
              orderBy: { createdAt: 'asc' },
              take: 50
            },
            summaries: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        })

        if (!session) {
          return reply.status(404).send({ error: 'Session not found' })
        }

        return reply.send({ session })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Get all sessions for user
  fastify.get(
    '/sessions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessions = await prisma.session.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 50
        })

        return reply.send({ sessions })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Get session context/messages
  fastify.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/contexts',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const contexts = await prisma.context.findMany({
          where: { sessionId: request.params.sessionId },
          orderBy: { createdAt: 'asc' }
        })

        // 转换 BigInt 为字符串
        const serialized = contexts.map(c => ({
          ...c,
          order: c.order.toString()
        }))

        return reply.send({ contexts: serialized })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Delete session
  fastify.delete<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        await prisma.session.delete({
          where: { id: request.params.sessionId }
        })

        return reply.send({ success: true })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Get conversation history (sessions list)
  fastify.get(
    '/history',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessions = await prisma.session.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 50
        })

        // 转换 BigInt 为字符串
        const serialized = sessions.map(s => ({
          ...s,
          isGroupChat: s.isGroupChat ?? false,
          groupAgents: s.groupAgents ?? [],
          projectId: s.projectId ?? null
        }))

        return reply.send({ sessions: serialized })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Update session status (e.g., resume after confirmation)
  fastify.patch<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/status',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const { status } = request.body as { status: string }

        const session = await prisma.session.update({
          where: { id: request.params.sessionId },
          data: { status: status as any }
        })

        return reply.send({ session })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // ==================== 消息分页 API ====================

  // 获取会话消息（默认最近100条，支持分页）
  fastify.get<{ Params: { sessionId: string }; Querystring: { before?: string; limit?: string } }>(
    '/sessions/:sessionId/messages',
    async (request: FastifyRequest<{ Params: { sessionId: string }; Querystring: { before?: string; limit?: string } }>, reply: FastifyReply) => {
      try {
        const { sessionId } = request.params
        const limit = Math.min(parseInt(request.query.limit || '100'), 100)
        const before = request.query.before

        // 构建查询条件
        const where: any = { sessionId }
        if (before) {
          // 如果有 before 参数，获取之前的历史消息
          const beforeMsg = await prisma.context.findUnique({ where: { id: before } })
          if (beforeMsg) {
            where.AND = [
              { createdAt: { lt: beforeMsg.createdAt } }
            ]
          }
        }

        const messages = await prisma.context.findMany({
          where,
          orderBy: [
            { createdAt: 'desc' },
            { order: 'desc' }
          ],
          take: limit
        })

        // 转换 BigInt 为字符串
        const serialized = messages.map(m => ({
          ...m,
          order: m.order.toString()
        })).reverse() // 按时间正序返回

        // 检查是否还有更多消息
        const hasMore = messages.length === limit

        return reply.send({
          messages: serialized,
          hasMore,
          nextCursor: hasMore && messages.length > 0 ? messages[0].id : null
        })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // 获取消息总数
  fastify.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/messages/count',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const count = await prisma.context.count({
          where: { sessionId: request.params.sessionId }
        })
        return reply.send({ count })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // ==================== 工作产物 API ====================

  // 获取会话的所有工作产物
  fastify.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/products',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const products = await workProductService.getProductsBySession(request.params.sessionId)
        return reply.send({ products })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // 获取单个工作产物详情
  fastify.get<{ Params: { sessionId: string; productId: string } }>(
    '/sessions/:sessionId/products/:productId',
    async (request: FastifyRequest<{ Params: { sessionId: string; productId: string } }>, reply: FastifyReply) => {
      try {
        const product = await workProductService.getProductById(request.params.productId)
        if (!product) {
          return reply.status(404).send({ error: 'Product not found' })
        }
        return reply.send({ product })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // 创建工作产物
  fastify.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/products',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      try {
        const { projectId, type, name, description, mimeType, content, storageKey, creatorAgentId, metadata } = request.body as any

        const product = await workProductService.createWorkProduct({
          projectId,
          sessionId: request.params.sessionId,
          type,
          name,
          description,
          mimeType,
          content,
          storageKey,
          creatorAgentId,
          metadata
        })

        return reply.send({ product })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // 删除工作产物
  fastify.delete<{ Params: { sessionId: string; productId: string } }>(
    '/sessions/:sessionId/products/:productId',
    async (request: FastifyRequest<{ Params: { sessionId: string; productId: string } }>, reply: FastifyReply) => {
      try {
        await workProductService.deleteProduct(request.params.productId)
        return reply.send({ success: true })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )
}