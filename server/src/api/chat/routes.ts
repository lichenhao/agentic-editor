import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../infrastructure/database/prisma'
import { ProjectAgentService } from '../../agents/service/project-agent.service'

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
          include: {
            contexts: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          take: 50
        })

        return reply.send({ sessions })
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
}