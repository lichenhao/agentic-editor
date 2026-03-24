import { prisma } from '../infrastructure/database/prisma'

// 用户输入类型
export type UserInputType = 'QUESTION' | 'REQUIREMENT' | 'EXECUTION'

// 分类结果
export interface InputClassification {
  type: UserInputType
  confidence: number      // 置信度 0-1
  reasoning: string       // 分类理由
  suggestedAction: string // 建议动作
}

// 基于规则+LLM的混合分类器
export class InputClassifier {
  private questionPatterns: RegExp[] = [
    /^(什么是|如何|怎么|怎样|为什么|哪里|谁|多少|几)/,
    /\?$/,
    /^(帮我查|帮我找|帮我看)/,
  ]

  private requirementPatterns: RegExp[] = [
    /^(帮我|帮我做|我要|需要你|请帮我|帮我创建|帮我设计|帮我写)/,
    /^(给我|给我做)/,
    /^(做一个|做一个|建一个)/,
  ]

  private executionPatterns: RegExp[] = [
    /^(去执行|开始做|立即完成|生成|创建|制作)/,
    /^(马上|立即|赶紧)/,
  ]

  /**
   * 分类用户输入
   */
  async classify(userMessage: string): Promise<InputClassification> {
    const message = userMessage.trim()

    // 1. 规则快速判断
    const ruleResult = this.ruleBasedClassify(message)
    if (ruleResult.confidence >= 0.8) {
      return ruleResult
    }

    // 2. LLM 深度判断（规则无法确定时）
    return await this.llmClassify(message)
  }

  /**
   * 基于规则的快速分类
   */
  private ruleBasedClassify(message: string): InputClassification {
    // 检查问题类模式
    for (const pattern of this.questionPatterns) {
      if (pattern.test(message)) {
        return {
          type: 'QUESTION',
          confidence: 0.8,
          reasoning: '匹配问题类句式',
          suggestedAction: 'search_and_answer',
        }
      }
    }

    // 检查需求类模式
    for (const pattern of this.requirementPatterns) {
      if (pattern.test(message)) {
        return {
          type: 'REQUIREMENT',
          confidence: 0.8,
          reasoning: '匹配需求类表达',
          suggestedAction: 'gather_requirements',
        }
      }
    }

    // 检查执行类模式
    for (const pattern of this.executionPatterns) {
      if (pattern.test(message)) {
        return {
          type: 'EXECUTION',
          confidence: 0.8,
          reasoning: '匹配执行类指令',
          suggestedAction: 'execute_directly',
        }
      }
    }

    // 无法通过规则判断
    return {
      type: 'QUESTION', // 默认问题类
      confidence: 0.3,
      reasoning: '无法通过规则判断，需要LLM分析',
      suggestedAction: 'llm_analyze',
    }
  }

  /**
   * LLM 深度分类
   */
  private async llmClassify(message: string): Promise<InputClassification> {
    try {
      // 使用 Claude 进行分类
      const { ClaudeService } = await import('../infrastructure/ai/claude')
      const claude = new ClaudeService()

      const prompt = `请分析以下用户输入，分类为以下类型之一：
- QUESTION（问题类）：用户提问，需要查找信息、调用工具或搜索后回答
- REQUIREMENT（需求类）：用户提出需求，需要多轮沟通确认后才能执行
- EXECUTION（执行类）：用户明确要求执行任务，可以直接分配给Agent执行

用户输入：${message}

请返回JSON格式：
{
  "type": "QUESTION|REQUIREMENT|EXECUTION",
  "confidence": 0.0-1.0,
  "reasoning": "分类理由"
}`

      const response = await claude.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
      })

      // 解析响应
      const content = response.content
      const jsonMatch = content.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          type: parsed.type as UserInputType,
          confidence: parsed.confidence || 0.7,
          reasoning: parsed.reasoning || 'LLM分析结果',
          suggestedAction: this.getSuggestedAction(parsed.type),
        }
      }
    } catch (error) {
      console.error('[InputClassifier] LLM classification failed:', error)
    }

    // LLM 失败时默认返回需求类
    return {
      type: 'REQUIREMENT',
      confidence: 0.5,
      reasoning: 'LLM分类失败，默认归类为需求类',
      suggestedAction: 'gather_requirements',
    }
  }

  /**
   * 根据类型获取建议动作
   */
  private getSuggestedAction(type: string): string {
    switch (type) {
      case 'QUESTION':
        return 'search_and_answer'
      case 'REQUIREMENT':
        return 'gather_requirements'
      case 'EXECUTION':
        return 'execute_directly'
      default:
        return 'llm_analyze'
    }
  }
}

// 导出单例
export const inputClassifier = new InputClassifier()