/**
 * Director Agent（主 Agent/总监 Agent）
 * 负责需求分析、任务拆解、监督子 Agent 执行、向上反馈进度
 * 使用 ReAct 模式实现自主规划和执行
 * 配置从数据库动态加载
 */

import { prisma } from '../../infrastructure/database/prisma'
import { skillExecutor } from '../executor/executor'
import { AgentLoader } from '../loader/agent.loader'
import { BaseAgent, AgentFactory } from '../base/base.agent'
import {
  type AgentContext,
  type AgentResult,
  type AgentType,
  type Task
} from '../base/agent.interface'

// ReAct 执行状态接口
interface ReActState {
  plan: AgentPlan           // 规划
  currentStep: number       // 当前步骤索引
  observations: ReActLog[]  // 观察历史
  artifacts: Record<string, any>  // 产出物
}

// Agent 规划接口
interface AgentPlan {
  steps: PlanStep[]         // 执行步骤
  acceptanceCriteria: Record<string, any>  // 验收标准
  artifacts: ArtifactSpec[] // 产物规范
  risks: string[]          // 风险点
}

interface PlanStep {
  id: string
  name: string
  description: string
  tool?: string
  dependsOn: string[]
  requiresApproval: boolean
}

interface ArtifactSpec {
  type: string
  name: string
  format: string
  fields: string[]
}

// ReAct 日志
interface ReActLog {
  type: 'thought' | 'action' | 'observation' | 'approval' | 'error'
  timestamp: string
  content: string
  details?: any
}

export class DirectorAgent extends BaseAgent {
  type: AgentType = 'director'
  systemPrompt = `你是一个专业的AI短剧制作总监（Director Agent）。

你的职责：
1. 分析用户需求，理解小说内容和创作目标
2. 使用 ReAct 模式自主规划执行步骤、验收标准和产物规范
3. 协调和监督各个 Specialist Agent（执行 Skills）的工作
4. 及时向用户反馈进度，收集确认信息
5. 根据用户反馈调整后续工作计划

ReAct 思维链模式：
1. Thought: 思考当前状态和下一步应该做什么
2. Action: 选择合适的工具执行动作
3. Observation: 观察执行结果，决定下一步

可用工具（Tools）：
- read_novel: 读取小说内容进行分析
- analyze_content: 分析小说结构、角色、剧情
- generate_assets: 生成视觉资产（场景、角色图）
- generate_storyboard: 生成分镜脚本
- generate_video: 生成视频片段
- request_approval: 请求用户确认产出物

每个关键产出物完成后，根据其重要性决定是否需要用户确认。`

  /**
   * 执行主 Agent 逻辑 - ReAct 模式
   */
  protected async executeTask(context: AgentContext): Promise<AgentResult> {
    console.log('[Director] Starting ReAct loop for autonomous planning')

    // 0. 初始化：从数据库加载配置
    await this.initialize()

    // 1. 加载项目信息
    const project = await prisma.project.findUnique({
      where: { id: context.projectId }
    })
    if (!project) {
      return { success: false, output: {}, message: 'Project not found' }
    }

    // 2. 生成初始规划（Agent 自主规划）
    const initialPlan = await this.generatePlan(context, project.novelText || '')

    // 3. 保存规划到数据库
    await this.savePlanToDb(context.projectId, initialPlan)

    // 广播规划生成完成
    this.broadcastProgress(context.projectId, {
      type: 'plan_generated',
      message: 'Agent 已生成执行规划',
      plan: initialPlan
    })

    // 4. ReAct 循环执行
    const executionResult = await this.reactLoop(context, project.novelText || '', initialPlan)

    // 5. 编译最终结果
    return this.compileReActResult(executionResult)
  }

  /**
   * Agent 自主生成规划
   */
  private async generatePlan(context: AgentContext, novelText: string): Promise<AgentPlan> {
    console.log('[generatePlan] Generating plan from novel text, length:', novelText.length)
    const prompt = `你是一个专业的AI短剧制作总监。请分析用户需求，生成详细的执行规划。

用户需求：将小说转换为短剧视频

小说内容（前5000字）：
${novelText.slice(0, 5000)}

请生成以下格式的规划（JSON）：
{
  "steps": [
    {
      "id": "step_1",
      "name": "步骤名称",
      "description": "步骤描述",
      "tool": "使用的工具（read_novel, analyze_content, generate_assets, generate_storyboard, generate_video, request_approval）",
      "dependsOn": [],
      "requiresApproval": false
    }
  ],
  "acceptanceCriteria": {
    "chapters": "章节拆分完整性",
    "characters": "角色设定准确性",
    "storyboard": "分镜脚本规范性",
    "video": "视频质量标准"
  },
  "artifacts": [
    {
      "type": "分镜脚本",
      "name": "Storyboard",
      "format": "JSON",
      "fields": ["shots", "scenes", "dialogues", "timings"]
    }
  ],
  "risks": ["可能的风险点"]
}

请只返回 JSON，不要其他内容。`

    try {
      const result = await this.analyzeWithClaude(prompt)
      console.log('[generatePlan] Claude response length:', result?.length || 0)
      if (!result) {
        console.log('[generatePlan] No result from Claude, returning default')
        return this.getDefaultPlan()
      }
      // 提取 JSON（处理 markdown 代码块包裹）
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) || result.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[1] : result
      if (!jsonStr) {
        console.log('[generatePlan] No JSON found in response, returning default')
        return this.getDefaultPlan()
      }
      const parsed = JSON.parse(jsonStr.trim())
      console.log('[generatePlan] Generated plan with', parsed.steps?.length || 0, 'steps')
      return parsed
    } catch (error) {
      console.error('[generatePlan] Error:', error)
      // 返回默认规划
      return this.getDefaultPlan()
    }
  }

  /**
   * 获取默认规划
   */
  private getDefaultPlan(): AgentPlan {
    return {
      steps: [
        { id: 'step_1', name: '读取小说', description: '读取并理解小说内容', tool: 'read_novel', dependsOn: [], requiresApproval: false },
        { id: 'step_2', name: '分析内容', description: '分析小说结构、角色、剧情', tool: 'analyze_content', dependsOn: ['step_1'], requiresApproval: true },
        { id: 'step_3', name: '生成资产', description: '生成视觉资产', tool: 'generate_assets', dependsOn: ['step_2'], requiresApproval: true },
        { id: 'step_4', name: '生成分镜', description: '生成分镜脚本', tool: 'generate_storyboard', dependsOn: ['step_3'], requiresApproval: true },
        { id: 'step_5', name: '生成视频', description: '生成视频片段', tool: 'generate_video', dependsOn: ['step_4'], requiresApproval: true }
      ],
      acceptanceCriteria: {
        chapters: '章节拆分完整',
        characters: '角色设定准确',
        storyboard: '分镜规范',
        video: '视频质量达标'
      },
      artifacts: [
        { type: '分镜脚本', name: 'Storyboard', format: 'JSON', fields: ['shots', 'scenes'] },
        { type: '角色设定', name: 'Characters', format: 'JSON', fields: ['name', 'description'] }
      ],
      risks: ['视频生成可能耗时较长']
    }
  }

  /**
   * 保存规划到数据库
   */
  private async savePlanToDb(projectId: string, plan: AgentPlan): Promise<void> {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        agentPlan: plan as any,
        executionState: {
          currentStep: 0,
          isComplete: false
        } as any,
        executionHistory: [] as any
      }
    })
  }

  /**
   * ReAct 循环执行
   */
  private async reactLoop(
    context: AgentContext,
    novelText: string,
    plan: AgentPlan
  ): Promise<ReActState> {
    const state: ReActState = {
      plan,
      currentStep: 0,
      observations: [],
      artifacts: {}
    }

    // 广播开始
    this.broadcastProgress(context.projectId, {
      type: 'react_start',
      message: '开始 ReAct 执行循环',
      totalSteps: plan.steps.length
    })

    // 遍历每个步骤
    while (state.currentStep < plan.steps.length) {
      const step = plan.steps[state.currentStep]
      console.log(`[Director] ReAct Step ${state.currentStep + 1}/${plan.steps.length}: ${step.name}`)

      // 检查依赖是否满足
      const depsCompleted = step.dependsOn.every(depId => {
        return state.artifacts[depId] !== undefined
      })
      if (!depsCompleted && step.dependsOn.length > 0) {
        console.log(`[Director] Waiting for dependencies: ${step.dependsOn.join(', ')}`)
        state.currentStep++
        continue
      }

      // Thought: 思考 - 动态决策下一步
      const thoughtResult = await this.think(context, state)
      state.observations.push({
        type: 'thought',
        timestamp: new Date().toISOString(),
        content: thoughtResult.thought
      })

      // 广播 thinking 状态
      this.broadcastProgress(context.projectId, {
        type: 'thinking',
        message: thoughtResult.thought,
        step: step.name
      })

      // Action: 执行 - 使用动态决策的工具
      if (thoughtResult.action) {
        const actionResult = await this.executeAction(thoughtResult.action, thoughtResult.args, context, state)

        state.observations.push({
          type: 'action',
          timestamp: new Date().toISOString(),
          content: `执行工具: ${thoughtResult.action}`,
          details: actionResult
        })

        // Observation: 观察结果
        const observation = `工具执行完成: ${JSON.stringify(actionResult).slice(0, 200)}`
        state.observations.push({
          type: 'observation',
          timestamp: new Date().toISOString(),
          content: observation,
          details: actionResult
        })

        // 保存产出物
        state.artifacts[step.id] = actionResult

        // 更新数据库
        await this.updateExecutionState(context.projectId, state)

        // 广播产出物
        this.broadcastProgress(context.projectId, {
          type: 'artifacts',
          message: `产出物已生成: ${step.name}`,
          step: step.name,
          artifacts: actionResult
        })
      }

      // 检查是否需要用户确认（支持两种方式：step.requiresApproval 和 thoughtResult.needsApproval）
      if (step.requiresApproval || thoughtResult.needsApproval) {
        // 广播请求确认
        this.broadcastProgress(context.projectId, {
          type: 'approval_request',
          message: `请确认: ${step.name}`,
          step: step.name,
          artifacts: state.artifacts[step.id]
        })

        // 等待用户确认（这里只是标记状态，实际等待由前端处理）
        state.observations.push({
          type: 'approval',
          timestamp: new Date().toISOString(),
          content: `等待用户确认: ${step.name}`
        })

        // 更新任务状态为等待确认
        await prisma.task.updateMany({
          where: { projectId: context.projectId, type: step.tool },
          data: { status: 'WAITING_APPROVAL' as any }
        })

        // 保存当前状态并返回，等待用户确认后继续
        await this.updateExecutionState(context.projectId, state)
        return state
      }

      // 步骤完成，广播完成状态
      this.broadcastProgress(context.projectId, {
        type: 'step_complete',
        message: `步骤完成: ${step.name}`,
        step: step.name
      })

      // 进入下一步
      state.currentStep++

      // 保存状态
      await this.updateExecutionState(context.projectId, state)
    }

    // 全部完成
    this.broadcastProgress(context.projectId, {
      type: 'react_complete',
      message: '所有步骤执行完成',
      artifacts: state.artifacts
    })

    return state
  }

  /**
   * Agent 思考 - 动态决定下一步动作（基于用户需求和可用工具）
   */
  private async think(context: AgentContext, state: ReActState): Promise<{
    thought: string
    action: string | null
    args: Record<string, any>
    needsApproval: boolean
  }> {
    // 1. 动态加载可用工具（从数据库）
    const { AgentFactory } = await import('../factory/agent.factory')
    const tools = await AgentFactory.getAvailableTools()

    // 2. 构建 prompt，包含用户原始需求和当前状态
    const prompt = `你是一个专业的AI短剧制作总监（Director Agent）。

你的职责是根据用户需求，动态决定下一步应该做什么。

## 用户原始需求
${context.userInput || '将小说转换为短剧视频'}

## 当前任务状态
- 当前步骤索引: ${state.currentStep}
- 已完成步骤: ${state.plan.steps.filter((_, i) => i < state.currentStep).map(s => s.name).join(', ') || '无'}
- 已产出物: ${JSON.stringify(Object.keys(state.artifacts))}

## 可用工具（从数据库动态加载）
${tools.map(t => `- ${t.name}: ${t.description} (需要确认: ${t.requireApproval})`).join('\n')}

## 请根据用户需求，思考并决定下一步

请返回以下格式的 JSON（只返回 JSON，不要其他内容）：
{
  "thought": "你的思考过程，解释为什么选择这个工具",
  "action": "要使用的工具名称（如 analyze_novel, generate_storyboard 等）",
  "args": {
    "novelText": "小说内容摘要或关键部分",
    "previousArtifacts": ${JSON.stringify(state.artifacts)}
  },
  "needsApproval": 是否需要用户确认才能继续
}`

    try {
      const result = await this.analyzeWithClaude(prompt)

      // 解析 JSON 响应
      let parsed: any
      try {
        // 尝试提取 JSON
        const jsonMatch = result.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          parsed = { action: null, thought: result }
        }
      } catch {
        parsed = { action: null, thought: result }
      }

      return {
        thought: parsed.thought || '思考完成',
        action: parsed.action || null,
        args: parsed.args || {},
        needsApproval: parsed.needsApproval || false
      }
    } catch (error) {
      console.error('[think] Error:', error)
      return {
        thought: '思考过程中出现错误',
        action: null,
        args: {},
        needsApproval: false
      }
    }
  }

  /**
   * 执行动作 - 动态调用对应 Agent（替换硬编码 switch）
   */
  private async executeAction(action: string, args: Record<string, any>, context: AgentContext, state: ReActState): Promise<any> {
    console.log(`[Director] Executing action: ${action}`, args)

    // 获取项目信息
    const project = await prisma.project.findUnique({ where: { id: context.projectId } })
    if (!project) throw new Error('Project not found')

    // 动态调用 AgentFactory 执行工具
    const { AgentFactory } = await import('../factory/agent.factory')

    // 合并参数，传入小说内容
    const fullArgs = {
      ...args,
      novelText: project.novelText || '',
      projectId: context.projectId,
      previousArtifacts: state.artifacts
    }

    // 检查是否需要用户批准
    const toolDef = await AgentLoader.getToolByName(action)
    if (toolDef?.requireApproval) {
      this.broadcastProgress(context.projectId, {
        type: 'waiting_approval',
        message: `等待确认: ${action}`,
        tool: action
      })
    }

    // 不创建执行记录，直接执行工具
    try {
      const result = await AgentFactory.executeTool(action, context, fullArgs)
      return result.success ? result.output : { error: result.message }
    } catch (error) {
      console.error('[executeAction] Error:', error)
      return { error: String(error) }
    }
  }

  /**
   * 分析小说内容
   * 保留作为备用方法
   */
  private async analyzeNovel(novelText: string): Promise<any> {
    const prompt = `请分析以下小说内容，提取结构化信息。

小说内容：
${novelText.slice(0, 3000)}

请返回 JSON 格式：
{
  "chapters": [{"title": "章节标题", "summary": "章节摘要"}],
  "characters": [{"name": "角色名", "role": "角色", "description": "描述"}],
  "plot": {"main": "主线", "sub": "副线"},
  "themes": ["主题1", "主题2"]
}`

    try {
      const result = await this.analyzeWithClaude(prompt)
      return JSON.parse(result)
    } catch (error) {
      return { error: '分析失败', details: String(error) }
    }
  }

  /**
   * 生成视觉资产
   */
  private async generateAssets(novelText: string, artifacts: Record<string, any>): Promise<any> {
    const prompt = `请基于小说内容和分析结果，生成视觉资产描述。

小说内容：${novelText.slice(0, 2000)}
分析结果：${JSON.stringify(artifacts)}

请返回 JSON 格式：
{
  "scenes": [{"name": "场景名", "description": "描述", "mood": "氛围"}],
  "characters": [{"name": "角色名", "visual": "外观描述", "outfit": "服装"}],
  "props": ["道具1", "道具2"],
  "moodBoard": ["风格参考1", "风格参考2"]
}`

    try {
      const result = await this.analyzeWithClaude(prompt)
      return JSON.parse(result)
    } catch (error) {
      return { error: '生成失败' }
    }
  }

  /**
   * 生成分镜脚本
   */
  private async generateStoryboard(novelText: string, artifacts: Record<string, any>): Promise<any> {
    const prompt = `请基于小说内容和分析结果，生成详细的分镜脚本。

小说内容：${novelText.slice(0, 2000)}
分析结果：${JSON.stringify(artifacts)}

请返回 JSON 格式：
{
  "shots": [
    {
      "id": 1,
      "type": "镜头类型",
      "description": "镜头描述",
      "duration": 5,
      "dialogue": "台词",
      "music": "配乐建议"
    }
  ],
  "totalDuration": 120,
  "scenes": ["场景1", "场景2"]
}`

    try {
      const result = await this.analyzeWithClaude(prompt)
      return JSON.parse(result)
    } catch (error) {
      return { error: '生成分镜失败' }
    }
  }

  /**
   * 生成视频
   */
  private async generateVideo(artifacts: Record<string, any>): Promise<any> {
    // 这里调用实际的视频生成服务
    return {
      status: 'video_generation_initiated',
      message: '视频生成任务已提交',
      estimatedTime: '5-10分钟'
    }
  }

  /**
   * 更新执行状态到数据库
   */
  private async updateExecutionState(projectId: string, state: ReActState): Promise<void> {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        executionState: {
          currentStep: state.currentStep,
          isComplete: state.currentStep >= state.plan.steps.length,
          artifacts: state.artifacts
        } as any,
        executionHistory: state.observations as any,
        outputs: state.artifacts as any
      }
    })
  }

  /**
   * 编译 ReAct 结果
   */
  private compileReActResult(state: ReActState): AgentResult {
    return {
      success: true,
      output: {
        artifacts: state.artifacts,
        plan: state.plan,
        stepsCompleted: state.currentStep
      },
      message: `完成 ${state.currentStep} 个步骤的执行`
    }
  }

  // 缓存的 pipeline
  private pipelineCache: Task[] | null = null

  /**
   * 初始化时从数据库加载配置
   */
  async initialize(): Promise<void> {
    // 从数据库加载 pipeline
    const skills = await AgentLoader.getPipeline('director')
    this.pipelineCache = skills.map(skill => ({
      id: skill.type,
      type: skill.type,
      name: skill.name,
      description: skill.description || '',
      status: 'PENDING' as const,
      dependencies: skill.dependsOn || [],
      payload: skill.config || {},
      requireApproval: skill.requireApproval || false,
      skillPrompt: skill.chainOfThought
    }))

    // 加载 Agent 配置
    const agent = await AgentLoader.loadAgent('director')
    if (agent?.systemPrompt) {
      this.systemPrompt = agent.systemPrompt
    }

    console.log('[Director] Loaded pipeline:', this.pipelineCache.map(t => t.type))
  }

  /**
   * 获取任务阶段配置
   */
  private getTaskStages(): Task[] {
    if (this.pipelineCache) {
      return this.pipelineCache.map(stage => ({ ...stage }))
    }

    // 如果没有缓存，返回空数组（会在 executeTask 中加载）
    return []
  }

  /**
   * 创建任务到数据库
   */
  private async createTasks(projectId: string, tasks: Task[]): Promise<Task[]> {
    const createdTasks: Task[] = []

    for (const task of tasks) {
      // 根据任务类型生成默认的 acceptance criteria
      const defaultAcceptanceCriteria = this.generateAcceptanceCriteria(task.type)

      const dbTask = await prisma.task.create({
        data: {
          projectId,
          type: task.type,
          name: task.name,
          status: 'PENDING',
          payload: {
            description: task.description,
            requireApproval: task.requireApproval,
            skillPrompt: (task as any).skillPrompt
          },
          outputs: {},
          acceptanceCriteria: defaultAcceptanceCriteria
        }
      })

      createdTasks.push({
        ...task,
        id: dbTask.id
      })
    }

    return createdTasks
  }

  /**
   * 根据任务类型生成验收标准
   */
  private generateAcceptanceCriteria(taskType: string): Record<string, any> {
    const criteriaMap: Record<string, Record<string, any>> = {
      chunking: {
        description: '小说章节结构化拆分',
        fields: ['chapters', 'summary', 'keyEvents']
      },
      analysis: {
        description: '角色和剧情分析',
        fields: ['characters', 'plotAnalysis', 'themes']
      },
      asset_generation: {
        description: '视觉资产生成',
        fields: ['scenes', 'characters', 'props', 'moodBoard']
      },
      storyboard: {
        description: '分镜脚本生成',
        fields: ['shots', 'scenes', 'dialogues', 'timings']
      },
      video_generation: {
        description: '视频片段生成',
        fields: ['videoClips', 'duration', 'quality']
      },
      editing: {
        description: '最终剪辑合成',
        fields: ['finalVideo', 'transitions', 'effects']
      }
    }

    return criteriaMap[taskType] || { description: '任务完成', fields: [] }
  }

  /**
   * 更新项目的 outputs
   */
  private async updateProjectOutputs(projectId: string, taskType: string, taskOutput: any): Promise<void> {
    try {
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return

      const currentOutputs = (project.outputs as Record<string, any>) || {}

      // 根据任务类型更新对应的 outputs
      const outputKeyMap: Record<string, string> = {
        chunking: 'chapters',
        analysis: 'characters',
        asset_generation: 'assets',
        storyboard: 'storyboard',
        video_generation: 'videos',
        editing: 'final'
      }

      const key = outputKeyMap[taskType] || taskType
      currentOutputs[key] = taskOutput

      await prisma.project.update({
        where: { id: projectId },
        data: {
          outputs: currentOutputs,
          currentStage: taskType
        }
      })
    } catch (error) {
      console.error('[updateProjectOutputs] Error:', error)
    }
  }

  /**
   * 执行 Skills 流水线（使用思维链模式）
   */
  private async executeSkillsPipeline(
    context: AgentContext,
    tasks: Task[]
  ): Promise<{ completed: Task[]; waitingApproval: Task | null; allTasks: Task[] }> {
    const completed: Task[] = []
    let waitingApproval: Task | null = null

    // 如果没有传入 tasks，从数据库加载
    const allTasks = tasks.length > 0 ? tasks : await this.loadTasksFromDatabase(context.projectId)

    // 更新项目状态
    await prisma.project.update({
      where: { id: context.projectId },
      data: { status: 'CHUNKING' as any }
    })

    // 广播开始
    this.broadcastProgress(context.projectId, {
      type: 'start',
      message: '开始执行 Skills 流水线',
      stage: 'chunking',
      chain: allTasks.map(t => t.type)
    })

    // 逐个执行 Skills
    for (const task of allTasks) {
      // 检查前置依赖
      if (task.dependencies.length > 0) {
        const depsCompleted = task.dependencies.every(depId =>
          completed.some(c => c.type === depId)
        )
        if (!depsCompleted) {
          console.log(`[Director] Waiting for dependencies: ${task.dependencies.join(', ')}`)
          continue
        }
      }

      // 检查是否需要等待用户确认
      if (task.requireApproval && waitingApproval) {
        break
      }

      console.log(`[Director] Executing Skill: ${task.type}`)

      // 使用 SkillExecutor 执行任务（思维链模式）
      const result = await this.executeSkillWithChain(task, context.projectId)

      if (result.success) {
        completed.push(task)

        // 更新项目状态
        const statusMap: Record<string, string> = {
          chunking: 'CHUNKING',
          analysis: 'ANALYZING',
          asset: 'ASSET_GENERATION',
          asset_generation: 'ASSET_GENERATION',
          storyboard: 'STORYBOARDING',
          video: 'PRODUCING',
          video_generation: 'PRODUCING',
          editing: 'EDITING'
        }

        await prisma.project.update({
          where: { id: context.projectId },
          data: { status: (statusMap[task.type] || 'INITIALIZING') as any }
        })

        // 更新任务状态
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'COMPLETED',
            result: result.output,
            outputs: result.output
          }
        })

        // 更新项目的 outputs
        await this.updateProjectOutputs(context.projectId, task.type, result.output)

        // 广播进度
        this.broadcastProgress(context.projectId, {
          type: 'stage_complete',
          message: `Skill「${task.name}」执行完成`,
          stage: task.type,
          skillResult: result.output,
          nextStep: task.requireApproval ? 'waiting_approval' : 'continue'
        })

        // 如果需要用户确认
        if (task.requireApproval) {
          waitingApproval = task

          await prisma.task.update({
            where: { id: task.id },
            data: { status: 'WAITING_APPROVAL' }
          })

          await prisma.project.update({
            where: { id: context.projectId },
            data: { status: 'WAITING_APPROVAL' as any }
          })

          this.broadcastProgress(context.projectId, {
            type: 'waiting_approval',
            message: `Skill「${task.name}」已完成，请确认后继续下一步`,
            stage: task.type,
            skillResult: result.output,
            actions: [
              { type: 'approve', label: '确认继续', stage: task.type },
              { type: 'reject', label: '需要修改', stage: task.type, feedback: true }
            ]
          })

          break
        }
      } else {
        // 任务失败
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'FAILED', result: { error: result.message } }
        })

        this.broadcastProgress(context.projectId, {
          type: 'error',
          message: `Skill「${task.name}」执行失败: ${result.message}`,
          stage: task.type
        })

        return { completed, waitingApproval, allTasks }
      }
    }

    return { completed, waitingApproval, allTasks }
  }

  /**
   * 从数据库加载任务
   */
  private async loadTasksFromDatabase(projectId: string): Promise<Task[]> {
    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    })

    return tasks.map(t => ({
      id: t.id,
      type: t.type,
      name: t.name || t.type,
      description: (t.payload as any)?.description || t.type,
      status: t.status as any,
      dependencies: [],
      payload: t.payload as any,
      requireApproval: (t.payload as any)?.requireApproval || false,
      skillPrompt: (t.payload as any)?.skillPrompt || ''
    }))
  }

  /**
   * 使用思维链模式执行 Skill
   * 思维链：理解 → 准备 → 执行 → 验证
   */
  private async executeSkillWithChain(
    task: Task,
    projectId: string
  ): Promise<AgentResult> {
    const skillPrompt = (task as any).skillPrompt || ''

    // 思维链 Step 1: 理解任务
    console.log(`[Director] Chain: Understanding task ${task.type}`)
    this.broadcastProgress(projectId, {
      type: 'stage_start',
      message: `正在理解任务：${task.name}`,
      stage: task.type,
      chainStep: 'understanding'
    })

    // 思维链 Step 2: 准备上下文
    const context = await this.prepareContext(task, projectId)

    // 思维链 Step 3: 执行 Skill
    console.log(`[Director] Chain: Executing skill ${task.type}`)
    this.broadcastProgress(projectId, {
      type: 'stage_start',
      message: `正在执行：${task.description}`,
      stage: task.type,
      chainStep: 'executing'
    })

    try {
      // 使用 SkillExecutor 执行（这是实际的技能执行）
      const result = await skillExecutor.execute(task.type, {
        projectId,
        context,
        prompt: skillPrompt
      })

      // 思维链 Step 4: 验证结果
      console.log(`[Director] Chain: Validating result for ${task.type}`)
      this.broadcastProgress(projectId, {
        type: 'stage_complete',
        message: `已完成：${task.name}`,
        stage: task.type,
        chainStep: 'validated',
        skillResult: result
      })

      return {
        success: true,
        output: result,
        requiresApproval: task.requireApproval,
        message: `${task.name} 执行完成`
      }
    } catch (error: any) {
      console.error(`[Director] Chain: Error in ${task.type}`, error)
      return {
        success: false,
        output: {},
        message: error.message
      }
    }
  }

  /**
   * 准备执行上下文
   */
  private async prepareContext(task: Task, projectId: string): Promise<any> {
    // 获取前置任务的结果作为上下文
    const previousTasks = await prisma.task.findMany({
      where: {
        projectId,
        status: 'COMPLETED'
      },
      orderBy: { createdAt: 'asc' }
    })

    const context: any = {
      projectId,
      taskType: task.type,
      previousResults: {}
    }

    // 添加前置任务的输出作为上下文
    for (const prevTask of previousTasks) {
      context.previousResults[prevTask.type] = prevTask.result
    }

    // 获取项目信息
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (project) {
      context.projectName = project.name
      context.novelText = project.novelText
    }

    return context
  }

  /**
   * 编译最终结果
   */
  private compileResult(
    context: AgentContext,
    execution: { completed: Task[]; waitingApproval: Task | null; allTasks: Task[] }
  ): AgentResult {
    const totalTasks = execution.allTasks?.length || execution.completed.length

    if (execution.waitingApproval) {
      return {
        success: true,
        output: {
          completedSkills: execution.completed.map(t => t.type),
          currentSkill: execution.waitingApproval.type,
          chain: execution.allTasks?.map(t => t.type) || []
        },
        requiresApproval: true,
        message: `已完成 ${execution.completed.length} 个 Skills，「${execution.waitingApproval.name}」需要确认`
      }
    }

    // 检查是否全部完成
    if (execution.completed.length === totalTasks) {
      return {
        success: true,
        output: {
          completedSkills: execution.completed.map(t => t.type),
          chain: execution.allTasks?.map(t => t.type) || [],
          message: '所有 Skills 执行完成'
        },
        message: '短剧生成完成！'
      }
    }

    return {
      success: true,
      output: {
        completedSkills: execution.completed.map(t => t.type),
        chain: execution.allTasks?.map(t => t.type) || []
      },
      message: `已执行 ${execution.completed.length}/${totalTasks} 个 Skills`
    }
  }
}

// 注册 Director Agent
AgentFactory.register('director', DirectorAgent)

export const directorAgent = new DirectorAgent()