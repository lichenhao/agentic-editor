/**
 * Agent 管理器
 * 负责 Agent 生命周期管理、状态跟踪和协调
 */

import { prisma } from '../../infrastructure/database/prisma'
import {
  type AgentType,
  type AgentContext,
  type AgentResult,
  type ProgressEvent
} from '../base/agent.interface'

// 导入所有 Agent
import { directorAgent } from '../director/director.agent'

export class AgentManager {
  private static instance: AgentManager

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager()
    }
    return AgentManager.instance
  }

  /**
   * 创建并启动 Director Agent
   */
  async startProject(projectId: string, userId: string): Promise<string> {
    console.log(`[AgentManager] Starting project: ${projectId}`)

    // 创建主 Agent 实例
    const agentInstance = await prisma.agentInstance.create({
      data: {
        agentType: 'director',
        projectId,
        level: 1,
        status: 'RUNNING',
        context: {
          startedAt: new Date().toISOString()
        }
      }
    })

    // 构建执行上下文
    const context: AgentContext = {
      projectId,
      userId,
      task: null,
      level: 1,
      history: [],
      userFeedback: [],
      preferences: {}
    }

    try {
      // 执行 Director Agent
      const result = await directorAgent.execute(context)

      // 更新 Agent 状态
      await prisma.agentInstance.update({
        where: { id: agentInstance.id },
        data: {
          status: result.requiresApproval ? 'WAITING' : 'COMPLETED',
          context: {
            ...agentInstance.context as object,
            result: result.output,
            message: result.message
          }
        }
      })

      return agentInstance.id
    } catch (error: any) {
      await prisma.agentInstance.update({
        where: { id: agentInstance.id },
        data: { status: 'FAILED' }
      })

      throw error
    }
  }

  /**
   * 获取 Agent 状态
   */
  async getAgentStatus(projectId: string): Promise<any> {
    const agents = await prisma.agentInstance.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })

    const executions = await prisma.agentExecution.findMany({
      where: {
        agentInstanceId: { in: agents.map(a => a.id) }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    return {
      agents: agents.map(a => ({
        id: a.id,
        type: a.agentType,
        level: a.level,
        status: a.status,
        currentTask: a.currentTask,
        iteration: a.iteration,
        createdAt: a.createdAt
      })),
      recentExecutions: executions.map(e => ({
        id: e.id,
        status: e.status,
        duration: e.duration,
        createdAt: e.createdAt
      }))
    }
  }

  /**
   * 批准任务并继续执行
   */
  async approveTask(projectId: string, taskType: string): Promise<AgentResult> {
    console.log(`[AgentManager] Approving task: ${taskType}`)

    // 更新任务状态
    await prisma.task.updateMany({
      where: { projectId, type: taskType },
      data: { status: 'APPROVED' }
    })

    // 查找下一个待执行的任务
    const nextTask = await prisma.task.findFirst({
      where: {
        projectId,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'asc' }
    })

    if (!nextTask) {
      return {
        success: true,
        output: {},
        message: '所有任务已完成'
      }
    }

    // 继续执行
    return this.executeTask(projectId, nextTask.type)
  }

  /**
   * 拒绝任务并请求修改（支持反馈循环）
   * 用户拒绝后，Agent 会根据反馈重新生成 outputs
   */
  async rejectTask(projectId: string, taskType: string, feedback: string): Promise<AgentResult> {
    console.log(`[AgentManager] Rejecting task: ${taskType}, feedback: ${feedback}`)

    // 1. 记录用户反馈到数据库
    await prisma.agentLearning.create({
      data: {
        agentType: taskType,
        projectId,
        feedback,
        improvement: { adjusted: true },
        applied: false
      }
    })

    // 2. 更新任务状态为需要修改，并将反馈存储到 feedback 字段
    await prisma.task.updateMany({
      where: { projectId, type: taskType },
      data: {
        status: 'NEEDS_REVISION',
        feedback: feedback
      }
    })

    // 3. 获取当前任务的输出和反馈，准备重新生成
    const task = await prisma.task.findFirst({
      where: { projectId, type: taskType }
    })

    if (task) {
      // 4. 触发重新执行 - 传入用户反馈
      try {
        const result = await this.regenerateWithFeedback(projectId, taskType, feedback, task)
        return result
      } catch (error: any) {
        console.error('[AgentManager] Regenerate error:', error)
        return {
          success: false,
          output: {},
          message: `重新生成失败: ${error.message}`
        }
      }
    }

    return {
      success: true,
      output: {},
      message: `已收到反馈，将根据"${feedback}"进行调整`
    }
  }

  /**
   * 根据用户反馈重新生成任务输出
   */
  private async regenerateWithFeedback(
    projectId: string,
    taskType: string,
    feedback: string,
    task: any
  ): Promise<AgentResult> {
    console.log(`[AgentManager] Regenerating ${taskType} with feedback: ${feedback}`)

    // 获取项目信息
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return { success: false, output: {}, message: 'Project not found' }
    }

    // 获取前置任务结果
    const previousTasks = await prisma.task.findMany({
      where: {
        projectId,
        status: 'COMPLETED',
        createdAt: { lt: task.createdAt }
      }
    })

    // 调用 skill executor 重新生成
    const { skillExecutor } = await import('../executor/executor')
    const result = await skillExecutor.execute(taskType, {
      projectId,
      prompt: `用户反馈：${feedback}\n\n请根据用户反馈重新生成任务输出。`,
      context: {
        previousResults: previousTasks.map(t => ({
          type: t.type,
          result: t.result
        }))
      }
    })

    if (result.success && result.output) {
      // 更新任务输出
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'WAITING_APPROVAL',
          result: result.output
        }
      })

      // 广播进度
      const { publishProjectProgress } = await import('../../services/project.service')
      publishProjectProgress(projectId, {
        type: 'regenerated',
        message: `根据反馈重新生成完成: ${feedback}`,
        stage: taskType,
        output: result.output
      })
    }

    return {
      success: result.success,
      output: result.output,
      message: result.success ? `已根据反馈重新生成: ${feedback}` : '重新生成失败'
    }
  }

  /**
   * 执行指定任务
   */
  async executeTask(projectId: string, taskType: string): Promise<AgentResult> {
    const task = await prisma.task.findFirst({
      where: { projectId, type: taskType, status: 'PENDING' }
    })

    if (!task) {
      return {
        success: false,
        output: {},
        message: `Task not found: ${taskType}`
      }
    }

    // 更新任务状态
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS' }
    })

    // 更新项目状态
    const statusMap: Record<string, string> = {
      chunking: 'CHUNKING',
      analysis: 'ANALYZING',
      asset: 'ASSET_GENERATION',
      storyboard: 'STORYBOARDING',
      video: 'PRODUCING',
      editing: 'EDITING'
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: (statusMap[taskType] || 'INITIALIZING') as any }
    })

    // 创建 Agent 实例执行任务
    const agentInstance = await prisma.agentInstance.create({
      data: {
        agentType: taskType as AgentType,
        projectId,
        level: 2,
        status: 'RUNNING',
        currentTask: taskType
      }
    })

    try {
      // 模拟任务执行（实际会调用各 Specialist Agent）
      const result = await this.simulateTaskExecution(projectId, taskType)

      // 更新状态
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: result.requiresApproval ? 'WAITING_APPROVAL' : 'COMPLETED',
          result: result.output
        }
      })

      await prisma.agentInstance.update({
        where: { id: agentInstance.id },
        data: { status: 'COMPLETED' }
      })

      return result
    } catch (error: any) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'FAILED' }
      })

      await prisma.agentInstance.update({
        where: { id: agentInstance.id },
        data: { status: 'FAILED' }
      })

      return {
        success: false,
        output: {},
        message: error.message
      }
    }
  }

  /**
   * 模拟任务执行（临时实现，后续会替换为真正的 Agent 调用）
   */
  private async simulateTaskExecution(projectId: string, taskType: string): Promise<AgentResult> {
    // 简单的延迟模拟
    await new Promise(resolve => setTimeout(resolve, 100))

    const results: Record<string, AgentResult> = {
      chunking: { success: true, output: { chunks: 5 }, message: '分片完成' },
      analysis: { success: true, output: { characters: 3, beats: 4 }, requiresApproval: true, message: '分析完成' },
      asset: { success: true, output: { assets: 3 }, requiresApproval: true, message: '资产生成完成' },
      storyboard: { success: true, output: { shots: 8 }, requiresApproval: true, message: '分镜完成' },
      video: { success: true, output: { generated: 8 }, message: '视频生成完成' },
      editing: { success: true, output: { url: 'final.mp4' }, requiresApproval: true, message: '剪辑完成' }
    }

    return results[taskType] || { success: false, output: {}, message: 'Unknown task' }
  }

  /**
   * 获取项目进度
   */
  async getProjectProgress(projectId: string): Promise<any> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        blueprint: true,
        assets: true,
        shots: true
      }
    })

    if (!project) {
      return { error: 'Project not found' }
    }

    const completedTasks = project.tasks.filter(t => t.status === 'COMPLETED').length
    const totalTasks = project.tasks.length

    // 找出待确认的任务
    const waitingApprovalTask = project.tasks.find(t => t.status === 'WAITING_APPROVAL')

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      progress: {
        completed: completedTasks,
        total: totalTasks,
        percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      },
      currentStage: project.status,
      waitingApproval: waitingApprovalTask ? {
        taskId: waitingApprovalTask.id,
        taskType: waitingApprovalTask.type,
        taskName: waitingApprovalTask.name
      } : null,
      blueprint: project.blueprint ? {
        charactersCount: (project.blueprint.characters as any[])?.length || 0,
        beatsCount: (project.blueprint.narrativeBeats as any[])?.length || 0
      } : null,
      assetsCount: project.assets.length,
      shotsCount: project.shots.length,
      completedShots: project.shots.filter(s => s.status === 'COMPLETED').length
    }
  }

  /**
   * 应用学习到的改进
   */
  async applyLearning(projectId: string, agentType: string): Promise<void> {
    const learnings = await prisma.agentLearning.findMany({
      where: {
        agentType,
        projectId,
        applied: false
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })

    if (learnings.length === 0) {
      return
    }

    // 合并改进建议
    const improvements = learnings
      .map(l => l.improvement)
      .filter(Boolean)

    console.log(`[AgentManager] Applying ${improvements.length} improvements for ${agentType}`)

    // 标记为已应用
    await prisma.agentLearning.updateMany({
      where: {
        id: { in: learnings.map(l => l.id) }
      },
      data: { applied: true }
    })
  }
}

export const agentManager = AgentManager.getInstance()