/**
 * Admin API Routes - 管理 Agent 和 Skills 配置
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { AgentLoader } from '../../agents/loader/agent.loader'

interface AgentParams {
  type: string
}

interface SkillParams {
  id: string
}

interface CreateAgentBody {
  type: string
  name?: string
  description?: string
  systemPrompt?: string
  level?: number
  isActive?: boolean
  config?: any
}

interface UpdateAgentBody {
  name?: string
  description?: string
  systemPrompt?: string
  isActive?: boolean
  config?: any
}

interface CreateSkillBody {
  agentType: string
  type: string
  name?: string
  description?: string
  chainOfThought?: string
  requireApproval?: boolean
  dependsOn?: string[]
  order?: number
  isActive?: boolean
  config?: any
}

interface UpdateSkillBody {
  name?: string
  description?: string
  chainOfThought?: string
  requireApproval?: boolean
  dependsOn?: string[]
  order?: number
  isActive?: boolean
  config?: any
}

export async function adminRoutes(fastify: FastifyInstance) {
  // ========== Agent APIs ==========

  // 获取所有 Agents
  fastify.get('/admin/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const agents = await AgentLoader.loadAgents()
      return reply.send({ agents })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 获取单个 Agent
  fastify.get('/admin/agents/:type', async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
    try {
      const agent = await AgentLoader.loadAgent(request.params.type)
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' })
      }
      return reply.send({ agent })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 创建 Agent
  fastify.post('/admin/agents', async (request: FastifyRequest<{ Body: CreateAgentBody }>, reply: FastifyReply) => {
    try {
      const { type, name, description, systemPrompt, level, isActive, config } = request.body

      if (!type) {
        return reply.status(400).send({ error: 'type is required' })
      }

      const agent = await AgentLoader.ensureAgentExists(type, {
        name,
        description,
        systemPrompt,
        level,
        isActive,
        config
      })

      return reply.send({ agent })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 更新 Agent
  fastify.put('/admin/agents/:type', async (request: FastifyRequest<{ Params: AgentParams; Body: UpdateAgentBody }>, reply: FastifyReply) => {
    try {
      const { type } = request.params
      const { name, description, systemPrompt, isActive, config } = request.body

      const agent = await AgentLoader.updateAgent(type, {
        name,
        description,
        systemPrompt,
        isActive,
        config
      })

      return reply.send({ agent })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 删除 Agent（软删除）
  fastify.delete('/admin/agents/:type', async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
    try {
      await AgentLoader.deleteAgent(request.params.type)
      return reply.send({ success: true })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // ========== Skill APIs ==========

  // 获取所有 Skills
  fastify.get('/admin/skills', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const skills = await AgentLoader.getAllSkills()
      return reply.send({ skills })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 获取指定 Agent 的 Skills
  fastify.get('/admin/agents/:type/skills', async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
    try {
      const skills = await AgentLoader.getSkillsForAgent(request.params.type)
      return reply.send({ skills })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 获取完整流水线
  fastify.get('/admin/agents/:type/pipeline', async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
    try {
      const pipeline = await AgentLoader.getPipeline(request.params.type)
      return reply.send({ pipeline })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 创建 Skill
  fastify.post('/admin/skills', async (request: FastifyRequest<{ Body: CreateSkillBody }>, reply: FastifyReply) => {
    try {
      const { agentType, type, name, description, chainOfThought, requireApproval, dependsOn, order, isActive, config } = request.body

      if (!agentType || !type) {
        return reply.status(400).send({ error: 'agentType and type are required' })
      }

      const skill = await AgentLoader.ensureSkillExists(agentType, type, {
        name,
        description,
        chainOfThought,
        requireApproval,
        dependsOn,
        order,
        isActive,
        config
      })

      return reply.send({ skill })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 更新 Skill
  fastify.put('/admin/skills/:id', async (request: FastifyRequest<{ Params: SkillParams; Body: UpdateSkillBody }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const { name, description, chainOfThought, requireApproval, dependsOn, order, isActive, config } = request.body

      const skill = await AgentLoader.updateSkill(id, {
        name,
        description,
        chainOfThought,
        requireApproval,
        dependsOn,
        order,
        isActive,
        config
      })

      return reply.send({ skill })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 删除 Skill（软删除）
  fastify.delete('/admin/skills/:id', async (request: FastifyRequest<{ Params: SkillParams }>, reply: FastifyReply) => {
    try {
      await AgentLoader.deleteSkill(request.params.id)
      return reply.send({ success: true })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // ========== 工具 APIs ==========

  // 清除缓存
  fastify.post('/admin/cache/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      AgentLoader.clearCache()
      return reply.send({ success: true, message: 'Cache cleared' })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 重新初始化（重新加载默认配置）
  fastify.post('/admin/reinitialize', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      AgentLoader.clearCache()
      await AgentLoader.initialize()
      return reply.send({ success: true, message: 'Reinitialized successfully' })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })
}