/**
 * Skill Executor - 使用 Claude 实现思维链模式的技能执行器
 * 每个 Skill 都通过 AI 进行思考和执行
 * 配置从数据库动态加载
 */

import { prisma } from '../../infrastructure/database/prisma'
import { callClaude, callClaudeWithMessages } from '../../infrastructure/ai/claude'
import { publishProjectProgress } from '../../services/project.service'
import { AgentLoader } from '../loader/agent.loader'

// Skill 配置缓存（从数据库加载）
let skillConfigsCache: Map<string, any> = new Map()

/**
 * 加载 Skill 配置（从数据库或使用默认）
 */
async function loadSkillConfig(skillType: string): Promise<any> {
  // 检查缓存
  if (skillConfigsCache.has(skillType)) {
    return skillConfigsCache.get(skillType)
  }

  // 从数据库加载
  const skills = await AgentLoader.getAllSkills()
  const skill = skills.find(s => s.type === skillType)

  if (skill) {
    const config = {
      name: skill.name,
      description: skill.description,
      chainOfThought: skill.chainOfThought,
      extractResult: getExtractResult(skillType)
    }
    skillConfigsCache.set(skillType, config)
    return config
  }

  // 如果没有找到，返回默认配置
  return getDefaultConfig(skillType)
}

/**
 * 根据 skill 类型获取结果提取函数
 */
function getExtractResult(skillType: string): (result: string) => any {
  const extractors: Record<string, (result: string) => any> = {
    chunking: (result: string) => {
      try {
        const match = result.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : { chunks: [] }
      } catch {
        return { chunks: [], raw: result }
      }
    },
    analysis: (result: string) => {
      try {
        const match = result.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : { worldSettings: {}, characters: [], narrativeBeats: [] }
      } catch {
        return { worldSettings: {}, characters: [], narrativeBeats: [], raw: result }
      }
    },
    asset_generation: (result: string) => {
      try {
        const match = result.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : { characters: [], scenes: [] }
      } catch {
        return { characters: [], scenes: [], raw: result }
      }
    },
    storyboard: (result: string) => {
      try {
        const match = result.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : { shots: [] }
      } catch {
        return { shots: [], raw: result }
      }
    },
    video_generation: (result: string) => {
      try {
        const match = result.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : { shots: [] }
      } catch {
        return { shots: [], raw: result }
      }
    },
    editing: (result: string) => {
      try {
        const match = result.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : { finalVideo: {} }
      } catch {
        return { finalVideo: {}, raw: result }
      }
    }
  }

  return extractors[skillType] || ((result: string) => {
    try {
      const match = result.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : {}
    } catch {
      return { raw: result }
    }
  })
}

/**
 * 获取默认配置（当数据库没有数据时）
 */
function getDefaultConfig(skillType: string): any {
  const defaults: Record<string, any> = {
    chunking: {
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
      extractResult: getExtractResult('chunking')
    },
    analysis: {
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
      extractResult: getExtractResult('analysis')
    },
    asset_generation: {
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
      extractResult: getExtractResult('asset_generation')
    },
    storyboard: {
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
      extractResult: getExtractResult('storyboard')
    },
    video_generation: {
      name: '视频生成',
      description: '调用视频生成工具创建视频片段',
      chainOfThought: `你是一个视频制作专家。你的任务是：

1. 为每个分镜镜头生成视频
2. 调用视频生成API（这里模拟）
3. 返回每个镜头的视频URL

请模拟返回每个镜头的生成状态和视频URL，JSON格式。`,
      extractResult: getExtractResult('video_generation')
    },
    editing: {
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
      extractResult: getExtractResult('editing')
    }
  }

  return defaults[skillType] || {
    name: skillType,
    description: '',
    chainOfThought: '',
    extractResult: getExtractResult(skillType)
  }
}

/**
 * 清除缓存（用于测试或重置）
 */
export function clearSkillCache(): void {
  skillConfigsCache.clear()
}

export class SkillExecutor {
  private projectSubscribers: Map<string, Set<(data: any) => void>> = new Map()

  /**
   * 执行 Skill - 使用思维链模式
   */
  async execute(skillType: string, params: {
    projectId: string
    context?: any
    prompt?: string
  }): Promise<any> {
    // 从数据库加载配置
    const config = await loadSkillConfig(skillType)
    if (!config) {
      throw new Error(`Unknown skill type: ${skillType}`)
    }

    console.log(`[SkillExecutor] Executing ${skillType} with Chain of Thought`)

    const { projectId, context, prompt } = params

    // Step 1: 准备输入
    const input = await this.prepareInput(skillType, projectId, context, prompt || config.chainOfThought)

    // Step 2: 调用 Claude 执行思维链
    this.broadcastProgress(projectId, {
      type: 'thinking',
      message: `正在思考：${config.name}`,
      skill: skillType,
      step: 'reasoning'
    })

    let result: string
    try {
      // 使用带上下文的 Claude 调用
      const messages = this.buildMessages(input, context)
      result = await callClaudeWithMessages(messages, config.chainOfThought)
    } catch (error: any) {
      console.error(`[SkillExecutor] Claude API error:`, error)
      // 如果 API 失败，使用模拟结果
      result = this.getMockResult(skillType)
    }

    // Step 3: 解析结果
    this.broadcastProgress(projectId, {
      type: 'thinking',
      message: `正在处理结果：${config.name}`,
      skill: skillType,
      step: 'extracting'
    })

    const extracted = config.extractResult(result)

    // Step 4: 保存结果到数据库
    await this.saveResult(skillType, projectId, extracted)

    // Step 5: 返回结果
    this.broadcastProgress(projectId, {
      type: 'skill_complete',
      message: `${config.name} 完成`,
      skill: skillType,
      result: extracted
    })

    return extracted
  }

  /**
   * 准备 Skill 输入
   */
  private async prepareInput(
    skillType: string,
    projectId: string,
    context: any,
    prompt: string
  ): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } })

    // 获取前置任务的结果
    const previousResults = await prisma.task.findMany({
      where: { projectId, status: 'COMPLETED' },
      orderBy: { createdAt: 'asc' }
    })

    let input = ''

    // 添加项目信息
    if (project?.novelText) {
      input += `小说内容：\n${project.novelText.substring(0, 10000)}\n\n`
    }

    // 添加前置任务结果作为上下文
    if (previousResults.length > 0) {
      input += `前置任务结果：\n`
      for (const task of previousResults) {
        input += `- ${task.type}: ${JSON.stringify(task.result)}\n`
      }
      input += '\n'
    }

    // 添加自定义 prompt
    if (prompt) {
      input += `\n任务要求：\n${prompt}\n`
    }

    return input
  }

  /**
   * 构建消息列表
   */
  private buildMessages(input: string, context?: any): { role: 'user' | 'assistant'; content: string }[] {
    const messages: { role: 'user' | 'assistant'; content: string }[] = []

    // 如果有上下文，添加之前的结果
    if (context?.previousResults) {
      for (const [skillType, result] of Object.entries(context.previousResults)) {
        messages.push({
          role: 'assistant' as const,
          content: `${skillType} 执行结果: ${JSON.stringify(result)}`
        })
      }
    }

    messages.push({ role: 'user' as const, content: input })

    return messages
  }

  /**
   * 保存 Skill 结果
   */
  private async saveResult(skillType: string, projectId: string, result: any): Promise<void> {
    // 根据 skillType 保存到不同的表
    switch (skillType) {
      case 'analysis':
        await prisma.blueprint.upsert({
          where: { projectId },
          update: {
            worldSettings: result.worldSettings || {},
            characters: result.characters || [],
            narrativeBeats: result.narrativeBeats || [],
            version: { increment: 1 }
          },
          create: {
            projectId,
            worldSettings: result.worldSettings || {},
            characters: result.characters || [],
            narrativeBeats: result.narrativeBeats || []
          }
        })
        break

      case 'asset_generation':
        // 保存资产
        if (result.characters) {
          for (const char of result.characters) {
            await prisma.asset.create({
              data: {
                projectId,
                type: 'character',
                name: char.name || '未知角色',
                profile: char,
                assetUrls: []
              }
            })
          }
        }
        break

      case 'storyboard':
        // 保存分镜
        if (result.shots) {
          for (let i = 0; i < result.shots.length; i++) {
            const shot = result.shots[i]
            await prisma.shot.create({
              data: {
                id: `shot-${projectId}-${i + 1}`,
                projectId,
                sceneId: shot.sceneId || `scene-${i + 1}`,
                shotType: shot.shotType || '中景',
                cameraMovement: shot.cameraMovement || '固定',
                description: shot.description || '',
                dialogue: shot.dialogue || null,
                status: 'PENDING'
              }
            })
          }
        }
        break

      case 'video_generation':
        // 更新 shot 状态
        const shots = await prisma.shot.findMany({ where: { projectId } })
        for (const shot of shots) {
          await prisma.shot.update({
            where: { id: shot.id },
            data: {
              status: 'COMPLETED',
              resultUrl: `https://example.com/videos/${shot.id}.mp4`
            }
          })
        }
        break

      case 'editing':
        // 已经在 project 表中更新状态
        break
    }
  }

  /**
   * 获取模拟结果（当 Claude API 失败时）
   */
  private getMockResult(skillType: string): string {
    const mockResults: Record<string, string> = {
      chunking: '{"chunks": [{"id": "chunk-1", "title": "第一章", "summary": "故事开始", "wordCount": 5000}], "totalChunks": 1}',
      analysis: '{"worldSettings": {"time": "现代", "location": "都市", "atmosphere": "紧张"}, "characters": [{"name": "主角", "role": "protagonist", "description": "主要角色"}], "narrativeBeats": [{"type": "开场", "description": "故事开始"}]}',
      asset_generation: '{"characters": [{"name": "主角", "visualDescription": "年轻男子,穿着西装"}], "scenes": [{"name": "办公室", "description": "现代风格办公室"}]}',
      storyboard: '{"shots": [{"shotNumber": 1, "sceneId": "scene-1", "shotType": "中景", "description": "主角走进办公室"}]}',
      video_generation: '{"shots": [{"id": "shot-1", "status": "completed", "url": "https://example.com/video1.mp4"}]}',
      editing: '{"finalVideo": {"url": "https://example.com/final.mp4", "duration": 120, "resolution": "1080p", "format": "mp4"}}'
    }

    return mockResults[skillType] || '{}'
  }

  /**
   * 广播进度
   */
  private broadcastProgress(projectId: string, data: any): void {
    publishProjectProgress(projectId, {
      ...data,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 订阅进度
   */
  subscribe(projectId: string, callback: (data: any) => void): () => void {
    if (!this.projectSubscribers.has(projectId)) {
      this.projectSubscribers.set(projectId, new Set())
    }
    this.projectSubscribers.get(projectId)!.add(callback)

    return () => {
      this.projectSubscribers.get(projectId)?.delete(callback)
    }
  }
}

export const skillExecutor = new SkillExecutor()