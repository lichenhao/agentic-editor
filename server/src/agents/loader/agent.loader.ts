/**
 * Agent Loader - 从数据库动态加载 Agent 和 Skills 配置
 * 支持 Agent 动态创建缺失的配置
 */

import { prisma } from '../../infrastructure/database/prisma'

// 默认 Agent 配置（当数据库为空时使用）
const DEFAULT_AGENTS = [
  {
    type: 'director',
    name: 'Director Agent',
    description: '主 Agent，负责需求分析、任务拆解、监督子 Agent 执行',
    systemPrompt: `你是一个专业的AI短剧制作总监（Director Agent）。

你的职责：
1. 分析用户需求，理解小说内容和创作目标
2. 将复杂任务拆解为可执行的子任务（Skills）
3. 协调和监督各个 Specialist Agent（执行 Skills）的工作
4. 及时向用户反馈进度，收集确认信息
5. 根据用户反馈调整后续工作计划

思维链模式（Chain of Skills）：
1. 理解需求 → 2. 拆解任务 → 3. 执行 Skill → 4. 验证结果 → 5. 继续/等待确认

每个 Skill 执行后，Director 需要：
- 评估执行结果是否达标
- 决定是否需要用户确认
- 根据反馈迭代后续任务`,
    level: 1,
    isActive: true,
    config: {
      maxSubAgents: 3,
      approvalRequiredFor: ['analysis', 'asset_generation', 'storyboard', 'editing']
    }
  },
  {
    type: 'chunking',
    name: 'Chunking Agent',
    description: '负责将小说内容进行智能分片',
    systemPrompt: `你是一个小说分片专家。你的任务是将长篇小说内容智能分片，每个片段约5000字，保留段落完整性和情节连贯性。`,
    level: 2,
    isActive: true,
    config: {
      chunkSize: 5000,
      overlap: 500
    }
  },
  {
    type: 'analysis',
    name: 'Analysis Agent',
    description: '负责剧本结构化分析，提取角色、场景、叙事节拍',
    systemPrompt: `你是一个专业的剧本分析师。你的任务是分析小说内容，提取：

1. 世界观设定：
   - 时间背景（年代、季节）
   - 空间地点（城市/乡村/室内/室外）
   - 氛围风格（紧张/轻松/悬疑/温馨）

2. 角色列表：
   - 主角：姓名、身份、性格特点、目标
   - 配角：姓名、身份、与主角关系
   - 反派：姓名、动机、特点

3. 叙事节拍（起承转合）：
   - 开场：故事背景和主角介绍
   - 发展：冲突出现，目标明确
   - 高潮：冲突升级，关键对决
   - 结局：问题解决，情感收尾`,
    level: 2,
    isActive: true,
    config: {}
  },
  {
    type: 'asset',
    name: 'Asset Agent',
    description: '负责生成角色定妆照和场景氛围图描述',
    systemPrompt: `你是一个视觉创意专家。你的任务是根据剧本分析结果，生成：

1. 角色定妆照描述：
   - 每个角色的外貌特征描述
   - 服装风格建议
   - 表情和姿态指引

2. 场景氛围图描述：
   - 每个场景的环境描述
   - 色调和光线建议
   - 氛围关键词`,
    level: 2,
    isActive: true,
    config: {}
  },
  {
    type: 'storyboard',
    name: 'Storyboard Agent',
    description: '负责生成详细的分镜脚本',
    systemPrompt: `你是一个AI导演。你的任务是：

基于叙事节拍和视觉资产，生成详细的分镜脚本。

每个镜头需要包含：
- 镜头编号和场景编号
- 景别：远景/全景/中景/近景/特写
- 摄像机运动：固定/推/拉/摇/移/跟
- 画面描述：角色动作、表情、环境
- 对白：角色台词（如果有）
- 时长估算`,
    level: 2,
    isActive: true,
    config: {}
  },
  {
    type: 'video',
    name: 'Video Agent',
    description: '负责调用视频生成工具创建视频片段',
    systemPrompt: `你是一个视频制作专家。你的任务是：

1. 为每个分镜镜头生成视频
2. 调用视频生成API
3. 返回每个镜头的视频URL`,
    level: 2,
    isActive: true,
    config: {}
  },
  {
    type: 'editing',
    name: 'Editing Agent',
    description: '负责合成最终成片',
    systemPrompt: `你是一个后期剪辑专家。你的任务是：

1. 将所有视频片段按分镜顺序排列
2. 添加合适的转场效果
3. 添加背景音乐和音效
4. 调整节奏和时长
5. 输出最终成片`,
    level: 2,
    isActive: true,
    config: {}
  }
]

// 默认 Skills 配置
const DEFAULT_SKILLS = [
  // Director Skills
  {
    agentType: 'director',
    type: 'task_decomposition',
    name: '任务拆解',
    description: '分析用户需求，拆解为可执行的子任务',
    chainOfThought: `你是一个任务规划专家。请分析用户需求，将复杂任务拆解为可执行的子任务列表。

请返回JSON格式：
{
  "tasks": [
    {"id": "task-1", "name": "任务名称", "description": "任务描述", "dependencies": []}
  ]
}`,
    requireApproval: false,
    dependsOn: [],
    order: 1,
    isActive: true,
    config: { timeout: 30000 },
    isTool: true,
    toolDefinition: {
      name: 'task_decomposition',
      description: '分析用户需求，拆解为可执行的子任务列表',
      parameters: { input: '用户需求描述' },
      returns: { tasks: '子任务列表' }
    },
    agentToCall: 'director'
  },
  // read_novel 工具
  {
    agentType: 'director',
    type: 'read_novel',
    name: '读取小说',
    description: '读取小说内容进行分析',
    chainOfThought: `你是一个阅读助手。你的任务是读取并理解小说内容，提取关键信息。`,
    requireApproval: false,
    dependsOn: [],
    order: 0,
    isActive: true,
    config: {},
    isTool: true,
    toolDefinition: {
      name: 'read_novel',
      description: '读取小说内容进行分析',
      parameters: { novelText: '小说全文' },
      returns: { content: '小说内容摘要' }
    },
    agentToCall: 'director'
  },
  // Chunking Skills
  {
    agentType: 'chunking',
    type: 'chunking',
    name: '小说解析',
    description: '将小说内容智能分片',
    chainOfThought: `你是一个小说分片专家。你的任务是：
1. 阅读小说内容
2. 识别章节结构和段落边界
3. 将小说分成合适的片段（每段约5000字）
4. 保留每个片段的标题和关键情节点

请以JSON格式返回分片结果：
{
  "chunks": [
    {"id": "chunk-1", "title": "章节标题", "summary": "内容概要", "wordCount": 数字}
  ],
  "totalChunks": 总数
}`,
    requireApproval: false,
    dependsOn: [],
    order: 1,
    isActive: true,
    config: { chunkSize: 5000 },
    isTool: true,
    toolDefinition: {
      name: 'chunking',
      description: '将小说内容智能分片',
      parameters: { novelText: '小说全文' },
      returns: { chunks: '分片结果列表' }
    },
    agentToCall: 'chunking'
  },
  // Analysis Skills
  {
    agentType: 'analysis',
    type: 'analysis',
    name: '剧本分析',
    description: '提取角色、场景、叙事节拍',
    chainOfThought: `你是一个专业的剧本分析师。你的任务是分析小说内容，提取：

1. 世界观设定：
   - 时间背景（年代、季节）
   - 空间地点（城市/乡村/室内/室外）
   - 氛围风格（紧张/轻松/悬疑/温馨）

2. 角色列表：
   - 主角：姓名、身份、性格特点、目标
   - 配角：姓名、身份、与主角关系
   - 反派：姓名、动机、特点

3. 叙事节拍（起承转合）：
   - 开场：故事背景和主角介绍
   - 发展：冲突出现，目标明确
   - 高潮：冲突升级，关键对决
   - 结局：问题解决，情感收尾

请以JSON格式返回分析结果。`,
    requireApproval: true,
    dependsOn: ['chunking'],
    order: 1,
    isActive: true,
    config: {},
    isTool: true,
    toolDefinition: {
      name: 'analyze_content',
      description: '分析小说结构、角色、剧情',
      parameters: { chunks: '分片后的内容' },
      returns: { characters: '角色列表', plot: '剧情结构', scenes: '场景列表' }
    },
    agentToCall: 'analysis'
  },
  // Asset Skills
  {
    agentType: 'asset',
    type: 'asset_generation',
    name: '视觉资产',
    description: '生成角色定妆照和场景氛围图描述',
    chainOfThought: `你是一个视觉创意专家。你的任务是根据剧本分析结果，生成：

1. 角色定妆照描述：
   - 每个角色的外貌特征描述
   - 服装风格建议
   - 表情和姿态指引

2. 场景氛围图描述：
   - 每个场景的环境描述
   - 色调和光线建议
   - 氛围关键词

请为每个角色和场景生成详细的视觉描述，JSON格式返回。`,
    requireApproval: true,
    dependsOn: ['analysis'],
    order: 1,
    isActive: true,
    config: {},
    isTool: true,
    toolDefinition: {
      name: 'generate_assets',
      description: '生成视觉资产（场景、角色图）',
      parameters: { analysis: '剧本分析结果' },
      returns: { characters: '角色视觉描述', scenes: '场景视觉描述' }
    },
    agentToCall: 'asset'
  },
  // Storyboard Skills
  {
    agentType: 'storyboard',
    type: 'storyboard',
    name: 'AI分镜',
    description: '生成详细的分镜脚本',
    chainOfThought: `你是一个AI导演。你的任务是：

基于叙事节拍和视觉资产，生成详细的分镜脚本。

每个镜头需要包含：
- 镜头编号和场景编号
- 景别：远景/全景/中景/近景/特写
- 摄像机运动：固定/推/拉/摇/移/跟
- 画面描述：角色动作、表情、环境
- 对白：角色台词（如果有）
- 时长估算

请生成所有镜头的分镜脚本，JSON格式返回。`,
    requireApproval: true,
    dependsOn: ['asset_generation'],
    order: 1,
    isActive: true,
    config: {},
    isTool: true,
    toolDefinition: {
      name: 'generate_storyboard',
      description: '生成分镜脚本',
      parameters: { assets: '视觉资产', analysis: '剧本分析' },
      returns: { shots: '分镜列表', scenes: '场景列表' }
    },
    agentToCall: 'storyboard'
  },
  // Video Skills
  {
    agentType: 'video',
    type: 'video_generation',
    name: '视频生成',
    description: '调用视频生成工具创建视频片段',
    chainOfThought: `你是一个视频制作专家。你的任务是：

1. 为每个分镜镜头生成视频
2. 调用视频生成API（这里模拟）
3. 返回每个镜头的视频URL

请模拟返回每个镜头的生成状态和视频URL，JSON格式。`,
    requireApproval: false,
    dependsOn: ['storyboard'],
    order: 1,
    isActive: true,
    config: {},
    isTool: true,
    toolDefinition: {
      name: 'generate_video',
      description: '生成视频片段',
      parameters: { storyboard: '分镜脚本' },
      returns: { videos: '视频URL列表' }
    },
    agentToCall: 'video'
  },
  // Editing Skills
  {
    agentType: 'editing',
    type: 'editing',
    name: '智能剪辑',
    description: '合成最终成片',
    chainOfThought: `你是一个后期剪辑专家。你的任务是：

1. 将所有视频片段按分镜顺序排列
2. 添加合适的转场效果
3. 添加背景音乐和音效
4. 调整节奏和时长
5. 输出最终成片

请返回最终的成片信息，JSON格式：
{
  "finalVideo": {
    "url": "视频URL",
    "duration": 总时长,
    "resolution": "分辨率",
    "format": "格式"
  },
  "summary": "剪辑总结"
}`,
    requireApproval: true,
    dependsOn: ['video_generation'],
    order: 1,
    isActive: true,
    config: {},
    isTool: true,
    toolDefinition: {
      name: 'final_editing',
      description: '合成最终成片',
      parameters: { videos: '视频片段列表' },
      returns: { finalVideo: '最终成片信息' }
    },
    agentToCall: 'editing'
  }
]

export class AgentLoader {
  private static agentsCache: Map<string, any> = new Map()
  private static skillsCache: Map<string, any[]> = new Map()
  private static initialized = false

  /**
   * 初始化：确保数据库中有默认的 Agent 和 Skills 配置
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return

    console.log('[AgentLoader] Initializing from database...')

    // 确保默认 Agents 存在
    for (const agentConfig of DEFAULT_AGENTS) {
      await this.ensureAgentExists(agentConfig.type, agentConfig)
    }

    // 确保默认 Skills 存在
    for (const skillConfig of DEFAULT_SKILLS) {
      await this.ensureSkillExists(skillConfig.agentType, skillConfig.type, skillConfig)
    }

    this.initialized = true
    console.log('[AgentLoader] Initialization complete')
  }

  /**
   * 加载所有 Agents
   */
  static async loadAgents(): Promise<any[]> {
    const agents = await prisma.agentDefinition.findMany({
      where: { isActive: true },
      orderBy: { level: 'asc' }
    })
    return agents
  }

  /**
   * 加载指定类型的 Agent
   */
  static async loadAgent(type: string): Promise<any | null> {
    // 检查缓存
    if (this.agentsCache.has(type)) {
      return this.agentsCache.get(type)
    }

    const agent = await prisma.agentDefinition.findUnique({
      where: { type }
    })

    if (agent) {
      this.agentsCache.set(type, agent)
    }

    return agent
  }

  /**
   * 获取 Agent 的所有 Skills（按 order 排序）
   */
  static async getSkillsForAgent(agentType: string): Promise<any[]> {
    // 检查缓存
    const cacheKey = `skills_${agentType}`
    if (this.skillsCache.has(cacheKey)) {
      return this.skillsCache.get(cacheKey)!
    }

    const skills = await prisma.skillDefinition.findMany({
      where: {
        agentType,
        isActive: true
      },
      orderBy: { order: 'asc' }
    })

    this.skillsCache.set(cacheKey, skills)
    return skills
  }

  /**
   * 获取所有工具（isTool=true 的 Skills）
   * 用于 ReAct 模式下的动态工具选择
   */
  static async getTools(): Promise<any[]> {
    const tools = await prisma.skillDefinition.findMany({
      where: {
        isTool: true,
        isActive: true
      }
    })
    return tools
  }

  /**
   * 根据工具名称获取工具定义
   */
  static async getToolByName(toolName: string): Promise<any | null> {
    const tool = await prisma.skillDefinition.findFirst({
      where: {
        type: toolName,
        isTool: true,
        isActive: true
      }
    })
    return tool
  }

  /**
   * 获取完整流水线（按依赖关系排序）
   */
  static async getPipeline(agentType: string): Promise<any[]> {
    const skills = await this.getSkillsForAgent(agentType)

    // 拓扑排序
    const sorted: any[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (skill: any) => {
      if (visited.has(skill.type)) return
      if (visiting.has(skill.type)) {
        console.warn(`[AgentLoader] Circular dependency detected: ${skill.type}`)
        return
      }

      visiting.add(skill.type)

      // 先访问依赖
      for (const dep of skill.dependsOn || []) {
        const depSkill = skills.find(s => s.type === dep)
        if (depSkill) {
          visit(depSkill)
        }
      }

      visiting.delete(skill.type)
      visited.add(skill.type)
      sorted.push(skill)
    }

    for (const skill of skills) {
      visit(skill)
    }

    return sorted
  }

  /**
   * 确保 Agent 存在，不存在则创建
   */
  static async ensureAgentExists(
    type: string,
    config: Partial<{
      name: string
      description: string
      systemPrompt: string
      level: number
      isActive: boolean
      config: any
    }>
  ): Promise<any> {
    let agent = await prisma.agentDefinition.findUnique({
      where: { type }
    })

    if (!agent) {
      // 使用默认值合并配置
      const defaultConfig = DEFAULT_AGENTS.find(a => a.type === type) as typeof DEFAULT_AGENTS[number] | undefined
      agent = await prisma.agentDefinition.create({
        data: {
          type,
          name: config.name || defaultConfig?.name || type,
          description: config.description || defaultConfig?.description || '',
          systemPrompt: config.systemPrompt || defaultConfig?.systemPrompt || '',
          level: config.level ?? defaultConfig?.level ?? 1,
          isActive: config.isActive ?? defaultConfig?.isActive ?? true,
          config: config.config ?? defaultConfig?.config ?? {}
        }
      })
      console.log(`[AgentLoader] Created new Agent: ${type}`)
    }

    this.agentsCache.set(type, agent)
    return agent
  }

  /**
   * 确保 Skill 存在，不存在则创建
   */
  static async ensureSkillExists(
    agentType: string,
    type: string,
    config: Partial<{
      name: string
      description: string
      chainOfThought: string
      requireApproval: boolean
      dependsOn: string[]
      order: number
      isActive: boolean
      config: any
      isTool: boolean
      toolDefinition: any
      agentToCall: string
    }>
  ): Promise<any> {
    let skill = await prisma.skillDefinition.findFirst({
      where: { agentType, type }
    })

    if (!skill) {
      // 使用默认值合并配置
      const defaultConfig = DEFAULT_SKILLS.find(s => s.agentType === agentType && s.type === type) as typeof DEFAULT_SKILLS[number] | undefined
      skill = await prisma.skillDefinition.create({
        data: {
          agentType,
          type,
          name: config.name || defaultConfig?.name || type,
          description: config.description || defaultConfig?.description || '',
          chainOfThought: config.chainOfThought || defaultConfig?.chainOfThought || '',
          requireApproval: config.requireApproval ?? defaultConfig?.requireApproval ?? false,
          dependsOn: config.dependsOn || defaultConfig?.dependsOn || [],
          order: config.order ?? defaultConfig?.order ?? 0,
          isActive: config.isActive ?? defaultConfig?.isActive ?? true,
          config: config.config ?? defaultConfig?.config ?? {},
          isTool: config.isTool ?? defaultConfig?.isTool ?? false,
          toolDefinition: config.toolDefinition ?? defaultConfig?.toolDefinition ?? null,
          agentToCall: config.agentToCall ?? defaultConfig?.agentToCall ?? null
        }
      })
      console.log(`[AgentLoader] Created new Skill: ${agentType}/${type}`)
    }

    // 清除缓存
    this.skillsCache.delete(`skills_${agentType}`)

    return skill
  }

  /**
   * 更新 Agent 配置
   */
  static async updateAgent(type: string, data: {
    name?: string
    description?: string
    systemPrompt?: string
    isActive?: boolean
    config?: any
  }): Promise<any> {
    const agent = await prisma.agentDefinition.update({
      where: { type },
      data
    })

    // 清除缓存
    this.agentsCache.delete(type)

    return agent
  }

  /**
   * 更新 Skill 配置
   */
  static async updateSkill(id: string, data: {
    name?: string
    description?: string
    chainOfThought?: string
    requireApproval?: boolean
    dependsOn?: string[]
    order?: number
    isActive?: boolean
    config?: any
    isTool?: boolean
    toolDefinition?: any
    agentToCall?: string
  }): Promise<any> {
    const skill = await prisma.skillDefinition.update({
      where: { id },
      data
    })

    // 清除缓存
    this.skillsCache.clear()

    return skill
  }

  /**
   * 删除 Agent（软删除）
   */
  static async deleteAgent(type: string): Promise<void> {
    await prisma.agentDefinition.update({
      where: { type },
      data: { isActive: false }
    })

    this.agentsCache.delete(type)
  }

  /**
   * 删除 Skill（软删除）
   */
  static async deleteSkill(id: string): Promise<void> {
    await prisma.skillDefinition.update({
      where: { id },
      data: { isActive: false }
    })

    this.skillsCache.clear()
  }

  /**
   * 获取所有 Skills（跨所有 Agents）
   */
  static async getAllSkills(): Promise<any[]> {
    return prisma.skillDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ agentType: 'asc' }, { order: 'asc' }]
    })
  }

  /**
   * 清除所有缓存（用于调试或重置）
   */
  static clearCache(): void {
    this.agentsCache.clear()
    this.skillsCache.clear()
  }
}