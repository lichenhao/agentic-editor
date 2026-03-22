/**
 * Project Agent Service - 项目专属 Agent 绑定服务
 * 负责为项目分配虚拟职员、加载项目配置、校准工作流
 */

import { prisma } from '../../infrastructure/database/prisma'

// 缓存
const projectAgentCache = new Map<string, any>()

export class ProjectAgentService {
  /**
   * 为项目分配 Agent（职业经理人）
   * 如果 AgentProfile 不存在，会自动创建
   */
  static async assignAgent(projectId: string, agentType: string): Promise<any> {
    // 检查是否已存在绑定
    const existing = await prisma.projectAgent.findUnique({
      where: {
        agentType_projectId: { agentType, projectId }
      }
    })

    if (existing) {
      return existing
    }

    // 确保 AgentProfile 存在（如果不存在则自动创建）
    await this.ensureAgentProfile(agentType)

    // 创建新的绑定
    const projectAgent = await prisma.projectAgent.create({
      data: {
        agentType,
        projectId,
        status: 'IDLE'
      }
    })

    // 清除缓存
    projectAgentCache.delete(projectId)

    return projectAgent
  }

  /**
   * 确保 AgentProfile 存在，如果不存在则创建
   */
  private static async ensureAgentProfile(agentType: string): Promise<void> {
    const existing = await prisma.agentProfile.findUnique({
      where: { type: agentType }
    })

    if (!existing) {
      // 创建默认的 AgentProfile
      await prisma.agentProfile.create({
        data: {
          type: agentType,
          name: agentType === 'director' ? '分析主（总监）' : '项目经理',
          role: agentType === 'director' ? '职业经理人' : '专家',
          description: `${agentType} Agent`,
          corePrompt: `你是一个专业的 AI ${agentType === 'director' ? '短剧制作总监' : '项目经理'}`,
          decisionLogic: '基于用户需求进行决策',
          level: 1,
          isActive: true
        }
      })
      console.log(`[ProjectAgentService] Created AgentProfile for: ${agentType}`)
    }
  }

  /**
   * 获取项目的 Agent 绑定
   */
  static async getProjectAgent(projectId: string, agentType?: string): Promise<any | null> {
    const cacheKey = `${projectId}_${agentType || 'default'}`

    if (projectAgentCache.has(cacheKey)) {
      return projectAgentCache.get(cacheKey)
    }

    const where: any = { projectId }
    if (agentType) {
      where.agentType = agentType
    }

    const projectAgent = await prisma.projectAgent.findFirst({
      where,
      include: {
        agent: {
          include: {
            skillBindings: {
              include: { skill: true }
            }
          }
        }
      }
    })

    if (projectAgent) {
      projectAgentCache.set(cacheKey, projectAgent)
    }

    return projectAgent
  }

  /**
   * 获取项目的所有 Agent 绑定
   */
  static async getProjectAgents(projectId: string): Promise<any[]> {
    return prisma.projectAgent.findMany({
      where: { projectId },
      include: {
        agent: true
      }
    })
  }

  /**
   * 校准项目的工作流和验收标准
   */
  static async calibrate(
    projectId: string,
    agentType: string,
    calibration: {
      calibrationPrompt?: string
      acceptanceCriteria?: any
      workflow?: any
    }
  ): Promise<any> {
    const projectAgent = await prisma.projectAgent.update({
      where: {
        agentType_projectId: { agentType, projectId }
      },
      data: {
        calibrationPrompt: calibration.calibrationPrompt,
        acceptanceCriteria: calibration.acceptanceCriteria,
        workflow: calibration.workflow,
        status: 'CALIBRATED'
      }
    })

    // 清除缓存
    projectAgentCache.delete(projectId)

    return projectAgent
  }

  /**
   * 更新项目 Agent 状态
   */
  static async updateStatus(
    projectId: string,
    agentType: string,
    status: string,
    context?: any
  ): Promise<any> {
    const projectAgent = await prisma.projectAgent.update({
      where: {
        agentType_projectId: { agentType, projectId }
      },
      data: {
        status,
        context
      }
    })

    // 清除缓存
    projectAgentCache.delete(projectId)

    return projectAgent
  }

  /**
   * 更新项目 Agent 上下文
   */
  static async updateContext(
    projectId: string,
    agentType: string,
    context: any
  ): Promise<any> {
    const projectAgent = await prisma.projectAgent.findUnique({
      where: {
        agentType_projectId: { agentType, projectId }
      }
    })

    if (!projectAgent) {
      throw new Error(`ProjectAgent not found: ${projectId}/${agentType}`)
    }

    const currentContext = projectAgent.context as any || {}
    const updatedContext = { ...currentContext, ...context }

    return prisma.projectAgent.update({
      where: {
        agentType_projectId: { agentType, projectId }
      },
      data: { context: updatedContext }
    })
  }

  /**
   * 切换项目的 Agent
   */
  static async switchAgent(projectId: string, newAgentType: string): Promise<any> {
    // 停用当前 Agent
    await prisma.projectAgent.updateMany({
      where: { projectId },
      data: { status: 'SWITCHED' }
    })

    // 分配新 Agent
    const newAgent = await this.assignAgent(projectId, newAgentType)

    // 清除缓存
    projectAgentCache.delete(projectId)

    return newAgent
  }

  /**
   * 移除项目的 Agent 绑定
   */
  static async removeAgent(projectId: string, agentType: string): Promise<void> {
    await prisma.projectAgent.delete({
      where: {
        agentType_projectId: { agentType, projectId }
      }
    })

    // 清除缓存
    projectAgentCache.delete(projectId)
  }

  /**
   * 获取项目的工作流配置
   */
  static async getWorkflow(projectId: string, agentType: string): Promise<any | null> {
    const projectAgent = await prisma.projectAgent.findUnique({
      where: {
        agentType_projectId: { agentType, projectId }
      }
    })

    return projectAgent?.workflow || null
  }

  /**
   * 获取项目的验收标准
   */
  static async getAcceptanceCriteria(projectId: string, agentType: string): Promise<any | null> {
    const projectAgent = await prisma.projectAgent.findUnique({
      where: {
        agentType_projectId: { agentType, projectId }
      }
    })

    return projectAgent?.acceptanceCriteria || null
  }

  /**
   * 清除所有缓存
   */
  static clearCache(): void {
    projectAgentCache.clear()
  }
}