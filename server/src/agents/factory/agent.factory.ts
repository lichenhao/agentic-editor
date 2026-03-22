import { prisma } from '../../infrastructure/database/prisma'
import { AgentLoader } from '../loader/agent.loader'
import { BaseAgent, AgentFactory as BaseAgentFactory } from '../base/base.agent'
import type { AgentContext, AgentResult, AgentType } from '../base/agent.interface'

/**
 * Agent 工厂 - 动态创建和调度多 Agent
 * 用于 ReAct 模式下的工具执行
 */
export class AgentFactory {
  /**
   * 根据 Agent 类型创建对应的 Agent 实例
   */
  static async createAgent(type: AgentType): Promise<BaseAgent> {
    // 尝试从数据库加载 Agent 定义
    const agentDef = await AgentLoader.loadAgent(type)

    // 加载该 Agent 的所有 Skills
    const skills = await AgentLoader.getSkillsForAgent(type)

    // 根据类型创建对应 Agent
    // 目前只有 Director Agent 实现，其他类型使用动态加载
    switch (type) {
      case 'director':
        // Director 使用默认实现
        const { DirectorAgent } = await import('../director/director.agent')
        return new DirectorAgent()

      default:
        // 其他类型使用基于 BaseAgent 的动态实现
        return new DynamicAgent(type, agentDef, skills)
    }
  }

  /**
   * 执行工具（调用对应的子 Agent）
   * 这是 ReAct 模式中 Action 的核心实现
   */
  static async executeTool(
    toolName: string,
    context: AgentContext,
    args: Record<string, any>
  ): Promise<AgentResult> {
    console.log(`[AgentFactory] Executing tool: ${toolName}`, args)

    // 从数据库获取工具定义
    const tool = await AgentLoader.getToolByName(toolName)

    if (!tool) {
      console.warn(`[AgentFactory] Tool not found: ${toolName}`)
      return {
        success: false,
        output: {},
        message: `工具 ${toolName} 不存在`
      }
    }

    // 如果工具定义了要调用的 Agent
    if (tool.agentToCall) {
      const agent = await this.createAgent(tool.agentType as AgentType)

      // 确保子 Agent 的 AgentInstance 存在
      const agentType = tool.agentToCall
      let agentInstance = await prisma.agentInstance.findFirst({
        where: {
          projectId: context.projectId,
          agentType,
          level: context.level + 1
        },
        orderBy: { createdAt: 'desc' }
      })

      if (!agentInstance) {
        agentInstance = await prisma.agentInstance.create({
          data: {
            agentType,
            projectId: context.projectId,
            level: context.level + 1,
            status: 'RUNNING',
            context: { startedAt: new Date().toISOString() }
          }
        })
        console.log(`[AgentFactory] Created agent instance for: ${agentType}`)
      }

      // 构建子 Agent 上下文
      const subContext: AgentContext = {
        ...context,
        task: args.input || args.novelText || '',
        level: context.level + 1
      }

      // 执行子 Agent
      const result = await agent.execute(subContext)
      return result
    }

    // 如果没有指定 agentToCall，尝试使用 skill 的 chainOfThought
    if (tool.chainOfThought) {
      const { skillExecutor } = await import('../executor/executor')
      return await skillExecutor.execute(tool.type, {
        projectId: context.projectId,
        prompt: tool.chainOfThought,
        context: args
      })
    }

    return {
      success: false,
      output: {},
      message: `工具 ${toolName} 没有可执行的配置`
    }
  }

  /**
   * 获取所有可用的工具列表（用于 Agent 决策）
   */
  static async getAvailableTools(): Promise<any[]> {
    const tools = await AgentLoader.getTools()

    // 转换为简化格式，便于 LLM 理解
    return tools.map(tool => ({
      name: tool.type,
      description: tool.description,
      agentToCall: tool.agentToCall,
      toolDefinition: tool.toolDefinition,
      requireApproval: tool.requireApproval
    }))
  }
}

/**
 * 动态 Agent - 基于数据库配置动态创建
 */
class DynamicAgent extends BaseAgent {
  type: AgentType
  systemPrompt: string
  private skills: any[]

  constructor(type: AgentType, agentDef: any, skills: any[]) {
    super()
    this.type = type
    this.systemPrompt = agentDef?.systemPrompt || ''
    this.skills = skills
  }

  protected async executeTask(context: AgentContext): Promise<AgentResult> {
    // 动态执行 - 使用 skillExecutor
    const { skillExecutor } = await import('../executor/executor')

    // 按顺序执行 skills
    const results: any[] = []
    for (const skill of this.skills) {
      const result = await skillExecutor.execute(skill.type, {
        projectId: context.projectId,
        context: { ...context, skills: this.skills }
      })
      results.push(result)
    }

    return {
      success: true,
      output: { results },
      message: `Dynamic agent completed ${this.skills.length} skills`
    }
  }
}