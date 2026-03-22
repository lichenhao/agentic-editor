/**
 * Feedback Processor - 反馈处理器
 * 分类用户反馈，提取偏好，应用到 Agent
 */

import { prisma } from '../../infrastructure/database/prisma'
import { PreferenceService } from './preference.service'

export type FeedbackCategory = 'approval' | 'rejection' | 'revision' | 'question'

export class FeedbackProcessor {
  /**
   * 处理用户反馈
   */
  static async process(
    projectId: string,
    userId: string,
    feedback: {
      targetType: string
      targetId: string
      content: string
      context?: any
    }
  ): Promise<{
    category: FeedbackCategory
    preference: any
    response: string
  }> {
    // 1. 分类反馈
    const category = this.categorizeFeedback(feedback.content)

    // 2. 收集到偏好服务
    await PreferenceService.collectFeedback(userId, projectId, {
      targetType: feedback.targetType,
      targetId: feedback.targetId,
      content: feedback.content,
      approved: category === 'approval'
    })

    // 3. 获取更新后的偏好
    const preference = await PreferenceService.getPreference(userId, projectId)

    // 4. 生成响应
    const response = this.generateResponse(category, preference)

    return { category, preference, response }
  }

  /**
   * 分类反馈
   */
  private static categorizeFeedback(content: string): FeedbackCategory {
    const lower = content.toLowerCase()

    // 问题
    if (lower.includes('?') || lower.includes('？') || lower.startsWith('怎么') || lower.startsWith('如何') || lower.startsWith('what') || lower.startsWith('how')) {
      return 'question'
    }

    // 拒绝
    if (lower.includes('不') && (lower.includes('好') || lower.includes('行') || lower.includes('要') || lower.includes('对'))) {
      return 'rejection'
    }

    // 修改
    if (lower.includes('改') || lower.includes('调') || lower.includes('调整') || lower.includes('重新') || lower.includes('再') || content.length > 30) {
      return 'revision'
    }

    // 批准（默认）
    return 'approval'
  }

  /**
   * 生成响应
   */
  private static generateResponse(category: FeedbackCategory, preference: any): string {
    switch (category) {
      case 'approval':
        return '收到您的确认，继续执行下一步工作'

      case 'rejection':
        return '理解您的顾虑，请告诉我您希望如何调整'

      case 'revision':
        return '收到您的修改意见，正在调整'

      case 'question':
        return '明白您的问题，我来解答'

      default:
        return '收到反馈'
    }
  }

  /**
   * 从确认记录中学习
   */
  static async learnFromConfirmation(confirmationId: string): Promise<void> {
    const confirmation = await prisma.confirmation.findUnique({
      where: { id: confirmationId },
      include: { draft: true }
    })

    if (!confirmation || !confirmation.projectId) {
      return
    }

    // 从确认状态学习
    await PreferenceService.collectFeedback(
      'system', // 由系统触发
      confirmation.projectId,
      {
        targetType: confirmation.stage,
        targetId: confirmation.id,
        content: confirmation.feedback || `状态: ${confirmation.status}`,
        approved: confirmation.status === 'APPROVED'
      }
    )
  }
}