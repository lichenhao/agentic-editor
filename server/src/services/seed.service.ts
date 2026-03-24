/**
 * Database Seeder - 初始化种子数据
 * 创建默认的 Agent 和 Skill 配置
 */

import { prisma } from '../infrastructure/database/prisma'
import { AgentRole, ExecutionMode } from '@prisma/client'

export async function seedDatabase() {
  console.log('[Seeder] Starting database seeding...')

  try {
    // 1. 创建默认用户（如果不存在）
    const defaultUser = await prisma.user.upsert({
      where: { email: 'default@agentic-editor.local' },
      update: {},
      create: {
        email: 'default@agentic-editor.local',
        name: 'Default User'
      }
    })
    console.log('[Seeder] Default user created/updated:', defaultUser.id)

    // 2. 创建 Secretary Agent Profile
    const secretaryProfile = await prisma.agentProfile.upsert({
      where: { type: 'secretary' },
      update: {},
      create: {
        type: 'secretary',
        name: '通用智能助理（秘书）',
        role: AgentRole.SECRETARY,
        corePrompt: `你是一个专业的通用智能助理（Secretary/秘书）。

你的核心职责：
1. **需求分析**：理解用户需求，识别任务类型和复杂度
2. **任务规划**：将复杂需求拆解为可执行的任务清单
3. **任务分配**：根据任务类型选择合适的执行 Agent
4. **监督执行**：监控任务执行进度，处理异常情况
5. **验收汇报**：汇总任务产出，生成验收报告

工作模式（Chain of Actions）：
1. 接收用户需求
2. 分析需求复杂度（简单/一般/复杂）
3. 简单任务 → 直接执行或分配给 Tool Agent
4. 复杂任务 → 拆解为子任务，构建 DAG 工作流
5. 遇到新领域 → 触发领域知识搜集和 Agent 注册
6. 执行过程中需要用户确认 → 暂停等待
7. 任务完成后 → 汇总产出，生成报告

关键能力：
- 识别用户意图和任务类型
- 构建 DAG 任务依赖图
- 处理任务打回和重做
- 管理用户介入流程（确认、反馈、终止）
- 生成结构化的验收报告

注意：
- 你不擅长具体执行工作，但非常擅长找到合适的工作人员
- 遇到不确定的领域时，主动进行知识搜集
- 保持与用户的沟通，及时反馈进度
- 确保所有产出物可追溯、可验收`,
        decisionLogic: `根据用户需求进行决策：
1. 如果是简单问候/闲聊 → 直接回复
2. 如果是简单任务（如查询、简单操作）→ 分配给 Tool Agent
3. 如果是一般任务 → 拆解为 2-3 个子任务，串行执行
4. 如果是复杂任务 → 拆解为多个子任务，并行执行
5. 如果遇到未知领域 → 触发领域知识搜集
6. 如果需要用户确认 → 暂停 DAG 执行，等待用户输入`,
        maxConcurrentTasks: 3,
        timeout: 300,
        retryCount: 3,
        isActive: true
      }
    })
    console.log('[Seeder] Secretary profile created/updated:', secretaryProfile.type)

    // 3. 创建通用 Tool Agent Profile
    const toolProfile = await prisma.agentProfile.upsert({
      where: { type: 'tool' },
      update: {},
      create: {
        type: 'tool',
        name: '工具人',
        role: AgentRole.TOOL,
        corePrompt: `你是一个简单的工具人 Agent，负责执行简单快速的任务。

特点：
- 单一职责，执行单一操作
- 快速响应，不需要复杂决策
- 标准化输出格式

常见任务：
- 文本处理（格式转换、提取、标注）
- 简单计算
- 信息查询
- 文件操作`,
        decisionLogic: `简单任务执行逻辑：
1. 解析任务要求
2. 执行标准化操作
3. 返回结果`,
        maxConcurrentTasks: 5,
        timeout: 60,
        retryCount: 2,
        isActive: true
      }
    })
    console.log('[Seeder] Tool profile created/updated:', toolProfile.type)

    // 4. 创建默认 Skills

    // 4.1 分析需求技能
    const analyzeSkill = await prisma.skillProfile.upsert({
      where: { type: 'analyze_requirement' },
      update: {},
      create: {
        type: 'analyze_requirement',
        name: '需求分析',
        description: '分析用户需求，识别任务类型和复杂度',
        skillPrompt: `分析用户输入的需求，返回结构化的分析结果。`,
        chainOfThought: `1. 理解用户意图
2. 识别关键词和任务类型
3. 评估任务复杂度
4. 输出分析结果`,
        isTool: false,
        dependsOn: [],
        order: 1,
        isActive: true
      }
    })

    // 4.2 任务规划技能
    const planSkill = await prisma.skillProfile.upsert({
      where: { type: 'plan_tasks' },
      update: {},
      create: {
        type: 'plan_tasks',
        name: '任务规划',
        description: '将需求拆解为可执行的任务清单',
        skillPrompt: `根据分析结果，生成任务列表和依赖关系。`,
        chainOfThought: `1. 根据任务类型选择执行模式
2. 拆解子任务
3. 确定依赖关系
4. 规划执行顺序`,
        isTool: false,
        dependsOn: ['analyze_requirement'],
        order: 2,
        isActive: true
      }
    })

    // 4.3 任务执行技能
    const executeSkill = await prisma.skillProfile.upsert({
      where: { type: 'execute_task' },
      update: {},
      create: {
        type: 'execute_task',
        name: '任务执行',
        description: '执行具体的任务操作',
        skillPrompt: `执行分配的任务，返回执行结果。`,
        chainOfThought: `1. 理解任务要求
2. 准备执行所需资源
3. 执行任务
4. 输出结果`,
        isTool: false,
        dependsOn: ['plan_tasks'],
        order: 3,
        isActive: true
      }
    })

    // 4.4 报告生成技能
    const reportSkill = await prisma.skillProfile.upsert({
      where: { type: 'generate_report' },
      update: {},
      create: {
        type: 'generate_report',
        name: '报告生成',
        description: '汇总任务产出，生成验收报告',
        skillPrompt: `汇总所有任务结果，生成结构化报告。`,
        chainOfThought: `1. 收集所有任务产出
2. 统计完成情况
3. 生成报告摘要
4. 输出验收结果`,
        isTool: false,
        dependsOn: ['execute_task'],
        order: 4,
        isActive: true
      }
    })

    // 4.5 文本处理技能（Tool 类型示例）
    const textProcessSkill = await prisma.skillProfile.upsert({
      where: { type: 'text_process' },
      update: {},
      create: {
        type: 'text_process',
        name: '文本处理',
        description: '简单文本处理操作（格式转换、提取、标注）',
        skillPrompt: `执行简单的文本处理任务。`,
        chainOfThought: `1. 解析任务要求
2. 执行文本操作
3. 返回结果`,
        isTool: true,
        toolDefinition: {
          name: 'text_process',
          description: '文本处理工具',
          parameters: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['format', 'extract', 'annotate', 'summarize']
              },
              content: { type: 'string' },
              options: { type: 'object' }
            },
            required: ['operation', 'content']
          }
        },
        dependsOn: [],
        order: 10,
        isActive: true
      }
    })

    console.log('[Seeder] Skills created:', {
      analyze: analyzeSkill.type,
      plan: planSkill.type,
      execute: executeSkill.type,
      report: reportSkill.type,
      textProcess: textProcessSkill.type
    })

    // 5. 绑定 Secretary 的 Skills
    await prisma.agentSkillBinding.upsert({
      where: { agentType_skillId: { agentType: 'secretary', skillId: analyzeSkill.id } },
      update: {},
      create: { agentType: 'secretary', skillId: analyzeSkill.id, config: { priority: 1 } }
    })
    await prisma.agentSkillBinding.upsert({
      where: { agentType_skillId: { agentType: 'secretary', skillId: planSkill.id } },
      update: {},
      create: { agentType: 'secretary', skillId: planSkill.id, config: { priority: 2 } }
    })
    await prisma.agentSkillBinding.upsert({
      where: { agentType_skillId: { agentType: 'secretary', skillId: executeSkill.id } },
      update: {},
      create: { agentType: 'secretary', skillId: executeSkill.id, config: { priority: 3 } }
    })
    await prisma.agentSkillBinding.upsert({
      where: { agentType_skillId: { agentType: 'secretary', skillId: reportSkill.id } },
      update: {},
      create: { agentType: 'secretary', skillId: reportSkill.id, config: { priority: 4 } }
    })

    // 6. 绑定 Tool 的 Skills
    await prisma.agentSkillBinding.upsert({
      where: { agentType_skillId: { agentType: 'tool', skillId: textProcessSkill.id } },
      update: {},
      create: { agentType: 'tool', skillId: textProcessSkill.id, config: { priority: 1 } }
    })

    console.log('[Seeder] Agent-Skill bindings created')

    console.log('[Seeder] Database seeding completed successfully!')
    return { success: true }

  } catch (error) {
    console.error('[Seeder] Error during seeding:', error)
    throw error
  }
}

// 导出主函数
export default seedDatabase