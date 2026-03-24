/**
 * Domain Knowledge Service - 领域知识服务
 * 负责新领域识别、知识搜集、Agent 类型生成
 */

import { prisma } from '../infrastructure/database/prisma'
import { AgentRole } from '@prisma/client'

export interface DomainAnalysis {
  domain: string
  name: string
  description: string
  requiredSkills: Array<{
    type: string
    name: string
    description: string
    skillPrompt: string
    chainOfThought: string
  }>
  requiredTools: string[]
  workflowSteps: string[]
  acceptanceCriteria: Record<string, any>
}

export interface AgentDefinition {
  type: string
  name: string
  role: AgentRole
  corePrompt: string
  decisionLogic: string
  maxConcurrentTasks: number
  timeout: number
  retryCount: number
  skills: Array<{
    skillType: string
    config?: Record<string, any>
  }>
}

export class DomainKnowledgeService {

  /**
   * 识别领域
   */
  async identifyDomain(userMessage: string): Promise<string | null> {
    // 简单关键词匹配（实际可用 NLP/Embedding）
    const domainKeywords: Record<string, string[]> = {
      'video_generation': ['视频', '生成视频', '短视频', '剪辑'],
      'image_generation': ['图片', '生成图片', '图像', '画图'],
      'code_generation': ['代码', '编程', '开发', '写程序'],
      'writing': ['写作', '文案', '文章', '创作'],
      'data_analysis': ['分析', '数据', '统计', '报表'],
      'translation': ['翻译', '语言', '多语言']
    }

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      for (const keyword of keywords) {
        if (userMessage.includes(keyword)) {
          console.log(`[DomainKnowledge] Identified domain: ${domain}`)
          return domain
        }
      }
    }

    return null
  }

  /**
   * 搜集领域知识
   */
  async collectKnowledge(domain: string): Promise<any> {
    // 检查是否已存在
    const existing = await prisma.domainKnowledge.findUnique({
      where: { domain }
    })

    if (existing && existing.status === 'READY') {
      console.log(`[DomainKnowledge] Using cached knowledge for: ${domain}`)
      return JSON.parse(existing.knowledge)
    }

    // 创建新的知识记录
    const knowledge = await prisma.domainKnowledge.upsert({
      where: { domain },
      update: { status: 'ANALYZING' },
      create: {
        domain,
        name: domain.replace(/_/g, ' '),
        description: `领域知识: ${domain}`,
        status: 'ANALYZING',
        knowledge: '{}'
      }
    })

    // 分析领域（这里可以接入外部知识库或 API）
    const analysis = await this.analyzeDomain(domain)

    // 更新知识记录
    await prisma.domainKnowledge.update({
      where: { domain },
      data: {
        knowledge: JSON.stringify(analysis),
        analysis: JSON.stringify(analysis),
        status: 'READY'
      }
    })

    console.log(`[DomainKnowledge] Knowledge collected for: ${domain}`)

    return analysis
  }

  /**
   * 分析领域，生成 Agent 定义
   */
  async analyzeDomain(domain: string): Promise<DomainAnalysis> {
    // 预定义的领域分析模板
    const domainTemplates: Record<string, DomainAnalysis> = {
      'video_generation': {
        domain: 'video_generation',
        name: '视频生成',
        description: '自动生成视频内容，包括脚本、字幕、配乐',
        requiredSkills: [
          {
            type: 'script_writing',
            name: '脚本写作',
            description: '编写视频脚本',
            skillPrompt: '根据用户需求编写视频脚本',
            chainOfThought: '1. 理解需求 2. 构思结构 3. 编写脚本'
          },
          {
            type: 'subtitle_generation',
            name: '字幕生成',
            description: '生成视频字幕',
            skillPrompt: '根据脚本生成字幕',
            chainOfThought: '1. 分析脚本 2. 时间轴对齐 3. 生成字幕'
          }
        ],
        requiredTools: ['video_api', 'tts_api'],
        workflowSteps: ['需求分析', '脚本生成', '视频生成', '后期处理'],
        acceptanceCriteria: {
          videoQuality: '>= 720p',
          duration: '符合要求',
          sync: '音画同步'
        }
      },
      'image_generation': {
        domain: 'image_generation',
        name: '图片生成',
        description: '根据描述生成图片',
        requiredSkills: [
          {
            type: 'prompt_optimization',
            name: '提示词优化',
            description: '优化图片生成提示词',
            skillPrompt: '将用户描述优化为 AI 可理解的提示词',
            chainOfThought: '1. 理解描述 2. 提取关键元素 3. 优化提示词'
          },
          {
            type: 'image_create',
            name: '图片创建',
            description: '调用 API 生成图片',
            skillPrompt: '使用图片生成 API 创建图片',
            chainOfThought: '1. 准备提示词 2. 调用 API 3. 返回结果'
          }
        ],
        requiredTools: ['image_api'],
        workflowSteps: ['需求理解', '提示词优化', '图片生成'],
        acceptanceCriteria: {
          resolution: '>= 1024x1024',
          quality: '清晰无噪点'
        }
      },
      'code_generation': {
        domain: 'code_generation',
        name: '代码生成',
        description: '根据需求生成代码',
        requiredSkills: [
          {
            type: 'requirement_analysis',
            name: '需求分析',
            description: '分析代码需求',
            skillPrompt: '分析用户需求，生成技术方案',
            chainOfThought: '1. 理解需求 2. 技术选型 3. 方案设计'
          },
          {
            type: 'code_write',
            name: '代码编写',
            description: '编写代码',
            skillPrompt: '根据技术方案编写代码',
            chainOfThought: '1. 框架搭建 2. 核心逻辑 3. 测试代码'
          }
        ],
        requiredTools: ['code_executor', 'linter'],
        workflowSteps: ['需求分析', '技术方案', '代码编写', '测试验证'],
        acceptanceCriteria: {
          syntax: '无语法错误',
          test: '测试通过'
        }
      }
    }

    // 返回模板或默认分析
    return domainTemplates[domain] || this.defaultAnalysis(domain)
  }

  /**
   * 默认领域分析
   */
  private defaultAnalysis(domain: string): DomainAnalysis {
    return {
      domain,
      name: domain.replace(/_/g, ' '),
      description: `自定义领域: ${domain}`,
      requiredSkills: [
        {
          type: 'general_task',
          name: '通用任务',
          description: '处理一般性任务',
          skillPrompt: '根据用户指令执行任务',
          chainOfThought: '1. 理解指令 2. 执行任务 3. 返回结果'
        }
      ],
      requiredTools: [],
      workflowSteps: ['理解需求', '执行任务', '返回结果'],
      acceptanceCriteria: {}
    }
  }

  /**
   * 生成新 Agent 定义
   */
  async generateAgentDefinition(analysis: DomainAnalysis): Promise<AgentDefinition> {
    const agentType = `${analysis.domain}_agent`

    const definition: AgentDefinition = {
      type: agentType,
      name: analysis.name,
      role: 'SPECIALIST',
      corePrompt: `你是一个专业的 ${analysis.name} Agent。

你的职责：
1. ${analysis.description}
2. 按照工作流程执行任务
3. 及时反馈进度和结果

工作流程：
${analysis.workflowSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

验收标准：
${JSON.stringify(analysis.acceptanceCriteria, null, 2)}`,
      decisionLogic: `你具备 Chain of Actions (CoA) 工作模式：
1. 评估任务复杂度
2. 选择合适的执行路径
3. 串行或并行执行子任务
4. 验收产出物
5. 必要时请求用户确认`,
      maxConcurrentTasks: 3,
      timeout: 300,
      retryCount: 3,
      skills: analysis.requiredSkills.map(skill => ({
        skillType: skill.type,
        config: {
          prompt: skill.skillPrompt,
          chainOfThought: skill.chainOfThought
        }
      }))
    }

    return definition
  }

  /**
   * 注册新 Agent 到数据库
   */
  async registerAgent(definition: AgentDefinition): Promise<any> {
    console.log(`[DomainKnowledge] Registering agent: ${definition.type}`)

    // 1. 创建 AgentProfile
    const agentProfile = await prisma.agentProfile.upsert({
      where: { type: definition.type },
      update: {
        name: definition.name,
        role: definition.role,
        corePrompt: definition.corePrompt,
        decisionLogic: definition.decisionLogic,
        maxConcurrentTasks: definition.maxConcurrentTasks,
        timeout: definition.timeout,
        retryCount: definition.retryCount
      },
      create: {
        type: definition.type,
        name: definition.name,
        role: definition.role,
        corePrompt: definition.corePrompt,
        decisionLogic: definition.decisionLogic,
        maxConcurrentTasks: definition.maxConcurrentTasks,
        timeout: definition.timeout,
        retryCount: definition.retryCount,
        isActive: true
      }
    })

    // 2. 创建 Skills（如果不存在）
    for (const skillDef of definition.skills) {
      await prisma.skillProfile.upsert({
        where: { type: skillDef.skillType },
        update: {
          name: skillDef.skillType.replace(/_/g, ' '),
          skillPrompt: skillDef.config?.prompt || '',
          chainOfThought: skillDef.config?.chainOfThought || ''
        },
        create: {
          type: skillDef.skillType,
          name: skillDef.skillType.replace(/_/g, ' '),
          skillPrompt: skillDef.config?.prompt || '',
          chainOfThought: skillDef.config?.chainOfThought || '',
          isActive: true
        }
      })

      // 3. 绑定 Agent-Skill
      await prisma.agentSkillBinding.upsert({
        where: {
          agentType_skillId: {
            agentType: definition.type,
            skillId: skillDef.skillType
          }
        },
        update: { config: skillDef.config },
        create: {
          agentType: definition.type,
          skillId: skillDef.skillType,
          config: skillDef.config
        }
      })
    }

    console.log(`[DomainKnowledge] Agent registered: ${definition.type}`)

    return agentProfile
  }

  /**
   * 处理新领域（识别 + 搜集 + 注册）
   */
  async handleNewDomain(userMessage: string): Promise<AgentDefinition | null> {
    // 1. 识别领域
    const domain = await this.identifyDomain(userMessage)
    if (!domain) {
      console.log('[DomainKnowledge] No specific domain identified')
      return null
    }

    // 2. 检查是否已注册
    const existingAgent = await prisma.agentProfile.findUnique({
      where: { type: `${domain}_agent` }
    })

    if (existingAgent) {
      console.log(`[DomainKnowledge] Agent already exists: ${existingAgent.type}`)
      return null
    }

    // 3. 搜集知识
    const knowledge = await this.collectKnowledge(domain)

    // 4. 生成 Agent 定义
    const agentDefinition = await this.generateAgentDefinition(knowledge)

    // 5. 注册 Agent
    await this.registerAgent(agentDefinition)

    console.log(`[DomainKnowledge] New agent created: ${agentDefinition.type}`)

    return agentDefinition
  }

  /**
   * 获取所有可用领域
   */
  async getAvailableDomains(): Promise<any[]> {
    return prisma.domainKnowledge.findMany({
      where: { status: 'READY' },
      orderBy: { name: 'asc' }
    })
  }

  /**
   * 获取 Agent 的工具定义（供 Agent 调用）
   */
  getAgentTools(): Array<{
    name: string
    description: string
    parameters: any
  }> {
    return [
      {
        name: 'identify_domain',
        description: '识别用户需求所属的领域',
        parameters: {
          type: 'object',
          properties: {
            userMessage: { type: 'string', description: '用户消息' }
          },
          required: ['userMessage']
        }
      },
      {
        name: 'collect_domain_knowledge',
        description: '搜集指定领域的知识',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: '领域标识' }
          },
          required: ['domain']
        }
      },
      {
        name: 'get_available_domains',
        description: '获取所有可用领域',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }
}

export const domainKnowledgeService = new DomainKnowledgeService()