import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { projectService } from '../../services/project.service'
import { orchestrator } from '../../agents/orchestrator'

export async function projectRoutes(fastify: FastifyInstance) {
  // Get all projects
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request.query as any).userId || 'default-user'
      const projects = await projectService.getProjects(userId)
      return reply.send({ projects })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // Get project by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const project = await projectService.getProject(request.params.id)
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' })
      }
      return reply.send({ project })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // Get project status (including pending approval)
  fastify.get<{ Params: { id: string } }>('/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const status = await orchestrator.getProjectStatus(request.params.id)
      return reply.send(status)
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // Approve task and continue
  fastify.post<{ Params: { id: string }; Body: { taskType: string } }>(
    '/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string }; Body: { taskType: string } }>, reply: FastifyReply) => {
      try {
        const { taskType } = request.body
        await orchestrator.approveTask(request.params.id, taskType)
        return reply.send({ success: true, message: '任务已确认，继续执行中...' })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Reject task (needs revision)
  fastify.post<{ Params: { id: string }; Body: { taskType: string; feedback: string } }>(
    '/:id/reject',
    async (request: FastifyRequest<{ Params: { id: string }; Body: { taskType: string; feedback: string } }>, reply: FastifyReply) => {
      try {
        const { taskType, feedback } = request.body
        await orchestrator.rejectTask(request.params.id, taskType, feedback)
        return reply.send({ success: true, message: '已记录反馈，等待修改' })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Get project progress (SSE)
  fastify.get<{ Params: { id: string } }>(
    '/:id/progress',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      const unsubscribe = await projectService.subscribeProgress(id, (data) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      })

      request.raw.on('close', () => {
        unsubscribe()
      })
    }
  )

  // Get storyboard
  fastify.get<{ Params: { id: string } }>(
    '/:id/storyboard',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const shots = await projectService.getStoryboard(request.params.id)
        return reply.send({ shots })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Update storyboard
  fastify.put<{ Params: { id: string }; Body: any }>(
    '/:id/storyboard',
    async (request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) => {
      try {
        await projectService.updateStoryboard(request.params.id, request.body as any[])
        return reply.send({ success: true })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Get delivery
  fastify.get<{ Params: { id: string } }>(
    '/:id/delivery',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const delivery = await projectService.getDelivery(request.params.id)
        return reply.send({ delivery })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Retry task
  fastify.post<{ Params: { id: string; taskId: string } }>(
    '/:id/retry/:taskId',
    async (request: FastifyRequest<{ Params: { id: string; taskId: string } }>, reply: FastifyReply) => {
      try {
        await projectService.retryTask(request.params.id, request.params.taskId)
        return reply.send({ success: true })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )

  // Delete project
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await projectService.deleteProject(request.params.id)
        return reply.send({ success: true })
      } catch (error: any) {
        request.log.error(error)
        return reply.status(500).send({ error: error.message })
      }
    }
  )
}