/**
 * Agent 基类
 * 所有 Agent 都继承自此类，提供通用能力
 */

import { prisma } from '../../infrastructure/database/prisma'
import { callClaude, callClaudeWithMessages } from '../../infrastructure/ai/claude'
import {
  type AgentContext,
  type AgentResult,
  type AgentType,
  type AgentPreference,
  type Task,
  type ToolCall
} from './agent.interface'

// Agent 类型到 Claude 模型映射
const AGENT_MODELS: Record<AgentType, string> = {
  director: 'claude-sonnet-4-20250514',
  chunking: 'claude-sonnet-4-20250514',
  analysis: 'claude-sonnet-4-20250514',
  asset: 'claude-sonnet-4-20250514',
  storyboard: 'claude-sonnet-4-20250514',
  video: 'claude-sonnet-4-20250514',
  editing: 'claude-sonnet-4-20250514',
  sub: 'claude-haiku-4-20250514'
}

export abstract class BaseAgent {
  abstract type: AgentType
  abstract systemPrompt: string

  protected maxLevel = 3  // 最多3层

  /**
   * 执行 Agent
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    console.log(`[${this.type}] Executing at level ${context.level}`)

    // 检查层级限制
    if (context.level > this.maxLevel) {
      return {
        success: false,
        output: {},
        message: '已达到最大层级限制，无法继续拆分'
      }
    }

    // 创建执行记录
    const execution = await this.createExecutionRecord(context)

    try {
      // 执行核心逻辑
      const result = await this.executeTask(context)

      // 更新执行记录
      await this.updateExecutionRecord(execution.id, {
        status: 'COMPLETED',
        output: result.output
      })

      return result
    } catch (error: any) {
      console.error(`[${this.type}] Error:`, error)

      await this.updateExecutionRecord(execution.id, {
        status: 'FAILED',
        error: error.message
      })

      return {
        success: false,
        output: {},
        message: `执行失败: ${error.message}`
      }
    }
  }

  /**
   * 子类实现的具体任务逻辑
   */
  protected abstract executeTask(context: AgentContext): Promise<AgentResult>

  /**
   * 使用 Claude 进行分析和推理
   */
  protected async analyzeWithClaude(prompt: string, context?: AgentContext): Promise<string> {
    try {
      // 构建消息历史
      const messages: { role: 'user' | 'assistant'; content: string }[] = []

      if (context?.history) {
        for (const record of context.history.slice(-5)) {
          messages.push({
            role: 'assistant',
            content: JSON.stringify(record.output)
          })
        }
      }

      messages.push({ role: 'user', content: prompt })

      return await callClaudeWithMessages(messages, this.systemPrompt)
    } catch (error: any) {
      console.error(`[${this.type}] Claude API error:`, error)
      throw error
    }
  }

  /**
   * 简单调用 Claude
   */
  protected async callClaude(prompt: string): Promise<string> {
    return await callClaude(prompt, this.systemPrompt)
  }

  /**
   * 创建子 Agent
   */
  protected async createSubAgent(
    agentType: AgentType,
    task: Task,
    parentAgentId: string,
    projectId: string,
    level: number
  ): Promise<string> {
    const agent = await prisma.agentInstance.create({
      data: {
        agentType,
        projectId,
        parentAgentId,
        level: level + 1,
        status: 'IDLE',
        currentTask: task.type,
        context: {
          task: task,
          iteration: 0
        }
      }
    })

    console.log(`[${this.type}] Created sub-agent: ${agentType} (${agent.id})`)
    return agent.id
  }

  /**
   * 等待用户确认
   */
  protected async waitForApproval(message: string): Promise<void> {
    // 暂停执行，等待外部触发继续
    return new Promise((resolve) => {
      // 实际由外部监听器处理
      console.log(`[${this.type}] Waiting for approval: ${message}`)
    })
  }

  /**
   * 记录用户反馈并学习
   */
  protected async learnFromFeedback(
    agentType: string,
    projectId: string | null,
    feedback: string,
    improvement?: any
  ): Promise<void> {
    await prisma.agentLearning.create({
      data: {
        agentType,
        projectId,
        feedback,
        improvement,
        applied: false
      }
    })

    console.log(`[${agentType}] Learned from feedback: ${feedback}`)
  }

  /**
   * 获取用户偏好设置
   */
  protected async getUserPreferences(agentType: string): Promise<AgentPreference | null> {
    // 从历史学习记录中提取偏好
    const learnings = await prisma.agentLearning.findMany({
      where: {
        agentType,
        applied: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    if (learnings.length === 0) {
      return null
    }

    // 合并所有改进建议
    const preferences: AgentPreference = {}
    for (const learning of learnings) {
      if (learning.improvement) {
        Object.assign(preferences, learning.improvement)
      }
    }

    return preferences
  }

  /**
   * 应用用户偏好到上下文中
   */
  protected applyPreferences(context: AgentContext, preferences: AgentPreference | null): AgentContext {
    if (!preferences) {
      return context
    }

    return {
      ...context,
      preferences: {
        ...context.preferences,
        ...preferences
      }
    }
  }

  /**
   * 检查任务是否需要进一步拆解
   */
  protected shouldDecompose(task: Task): boolean {
    // 复杂任务需要拆解
    const complexTasks = ['analysis', 'asset_generation', 'storyboard', 'editing']
    return complexTasks.includes(task.type)
  }

  /**
   * 创建执行记录
   */
  private async createExecutionRecord(context: AgentContext): Promise<any> {
    // 尝试查找已存在的 AgentInstance
    let instance = await prisma.agentInstance.findFirst({
      where: {
        projectId: context.projectId,
        agentType: this.type,
        level: context.level
      },
      orderBy: { createdAt: 'desc' },
      take: 1
    })

    // 如果没有已存在的实例，则创建一个
    if (!instance) {
      console.log(`[${this.type}] Creating new agent instance for project: ${context.projectId}`)
      instance = await prisma.agentInstance.create({
        data: {
          agentType: this.type,
          projectId: context.projectId,
          level: context.level,
          status: 'RUNNING',
          context: {
            startedAt: new Date().toISOString(),
            userInput: context.userInput
          }
        }
      })
    }

    return await prisma.agentExecution.create({
      data: {
        agentInstanceId: instance.id,
        input: {
          task: context.task,
          level: context.level,
          preferences: context.preferences
        },
        status: 'RUNNING'
      }
    })
  }

  /**
   * 更新执行记录
   */
  private async updateExecutionRecord(executionId: string, data: any): Promise<void> {
    await prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        ...data,
        duration: data.duration || 0
      }
    })
  }

  /**
   * 广播进度
   */
  protected broadcastProgress(projectId: string, data: any): void {
    // 导入 project service 的广播函数
    import('../../services/project.service').then(({ publishProjectProgress }) => {
      publishProjectProgress(projectId, {
        ...data,
        agentType: this.type,
        timestamp: new Date()
      })
    })
  }
}

/**
 * Agent 工厂 - 创建 Agent 实例
 */
export class AgentFactory {
  private static agents: Map<AgentType, any> = new Map()

  static register(agentType: AgentType, agent: any): void {
    this.agents.set(agentType, agent)
  }

  static get(agentType: AgentType): any {
    const AgentClass = this.agents.get(agentType)
    if (!AgentClass) {
      throw new Error(`Agent type not found: ${agentType}`)
    }
    return new AgentClass()
  }

  static async create(
    agentType: AgentType,
    projectId: string,
    parentAgentId?: string,
    level: number = 1
  ): Promise<string> {
    const agent = await prisma.agentInstance.create({
      data: {
        agentType,
        projectId,
        parentAgentId,
        level,
        status: 'IDLE',
        context: {}
      }
    })

    return agent.id
  }
}