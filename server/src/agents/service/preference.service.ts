/**
 * Preference Service - 用户偏好学习服务
 * 从用户反馈中提取偏好模式，生成用户画像
 */

import { prisma } from '../../infrastructure/database/prisma'

export class PreferenceService {
  /**
   * 收集用户反馈
   */
  static async collectFeedback(
    userId: string,
    projectId: string | null,
    feedback: {
      targetType: string  // 反馈目标类型：agent, skill, task, output
      targetId: string
      content: string
      approved: boolean   // 是否批准
      revision?: string   // 修改意见
    }
  ): Promise<any> {
    // 创建反馈记录
    const feedbackRecord = await prisma.agentLearning.create({
      data: {
        agentType: feedback.targetType,
        projectId,
        feedback: feedback.content,
        applied: false
      }
    })

    // 如果反馈达到一定数量，触发偏好提取
    const recentFeedbacks = await prisma.agentLearning.findMany({
      where: {
        projectId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 最近7天
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // 每5条反馈或批准/拒绝时更新偏好
    if (recentFeedbacks.length % 5 === 0 || recentFeedbacks.length >= 1) {
      await this.extractPreferences(userId, projectId, recentFeedbacks)
    }

    return feedbackRecord
  }

  /**
   * 提取用户偏好
   */
  private static async extractPreferences(
    userId: string,
    projectId: string | null,
    feedbacks: any[]
  ): Promise<any> {
    // 分类反馈
    const approvals = feedbacks.filter(f => f.feedback.toLowerCase().includes('好') || f.feedback.toLowerCase().includes('ok') || f.feedback.toLowerCase().includes('yes'))
    const rejections = feedbacks.filter(f => f.feedback.toLowerCase().includes('不') || f.feedback.toLowerCase().includes('no') || f.feedback.toLowerCase().includes('差'))
    const revisions = feedbacks.filter(f => f.feedback.length > 20) // 较长的反馈视为修改意见

    // 统计偏好模式
    const decisionPattern = {
      approvalRate: feedbacks.length > 0 ? approvals.length / feedbacks.length : 0,
      revisionRate: feedbacks.length > 0 ? revisions.length / feedbacks.length : 0,
      avgFeedbackLength: feedbacks.reduce((sum, f) => sum + f.feedback.length, 0) / feedbacks.length,
      recentFeedbackCount: feedbacks.length
    }

    // 提取风格偏好（从修改意见中）
    const stylePreferences: Record<string, any> = {}
    for (const revision of revisions) {
      const content = revision.feedback.toLowerCase()
      if (content.includes('详细') || content.includes('具体')) {
        stylePreferences.detailLevel = 'high'
      } else if (content.includes('简单') || content.includes('概要')) {
        stylePreferences.detailLevel = 'low'
      }
      if (content.includes('创意') || content.includes('新颖')) {
        stylePreferences.creativity = 'high'
      } else if (content.includes('保守') || content.includes('传统')) {
        stylePreferences.creativity = 'low'
      }
    }

    // 提取沟通偏好
    const communicationStyle = {
      feedbackFrequency: feedbacks.length > 0 ? 'high' : 'low',
      preferDirect: revisions.length > approvals.length,
      detailOrientation: stylePreferences.detailLevel || 'medium'
    }

    // 更新或创建偏好模型
    const preferenceData = {
      userId,
      projectId,
      decisionPattern,
      stylePreference: Object.keys(stylePreferences).length > 0 ? stylePreferences : undefined,
      communicationStyle
    }

    return prisma.userPreferenceModel.upsert({
      where: {
        userId_projectId: { userId, projectId: projectId || '' }
      },
      create: preferenceData,
      update: preferenceData
    })
  }

  /**
   * 获取用户偏好
   */
  static async getPreference(
    userId: string,
    projectId?: string
  ): Promise<any | null> {
    // 先尝试项目级别偏好，再尝试全局偏好
    if (projectId) {
      const projectPref = await prisma.userPreferenceModel.findUnique({
        where: {
          userId_projectId: { userId, projectId }
        }
      })
      if (projectPref) return projectPref
    }

    // 全局偏好
    return prisma.userPreferenceModel.findUnique({
      where: {
        userId_projectId: { userId, projectId: null as any }
      }
    })
  }

  /**
   * 将偏好注入 Agent 提示词
   */
  static async injectIntoPrompt(
    agentType: string,
    userId: string,
    projectId?: string
  ): Promise<string> {
    const preference = await this.getPreference(userId, projectId)

    if (!preference) {
      return '' // 无偏好时返回空
    }

    const injections: string[] = []

    // 注入决策模式
    if (preference.decisionPattern) {
      const dp = preference.decisionPattern as any
      if (dp.approvalRate > 0.8) {
        injections.push('用户倾向于快速确认，可以一次性提交多个选项供选择')
      } else if (dp.approvalRate < 0.5) {
        injections.push('用户比较谨慎，需要详细说明每个选项的利弊')
      }
    }

    // 注入风格偏好
    if (preference.stylePreference) {
      const sp = preference.stylePreference as any
      if (sp.detailLevel === 'high') {
        injections.push('用户喜欢详细、具体的输出内容')
      } else if (sp.detailLevel === 'low') {
        injections.push('用户喜欢简洁概要的输出')
      }
      if (sp.creativity === 'high') {
        injections.push('用户喜欢创新、新颖的方案')
      } else if (sp.creativity === 'low') {
        injections.push('用户偏好稳健、成熟的方案')
      }
    }

    // 注入沟通偏好
    if (preference.communicationStyle) {
      const cs = preference.communicationStyle as any
      if (cs.preferDirect) {
        injections.push('用户希望直接看到修改后的结果，而非解释过程')
      }
    }

    return injections.length > 0
      ? `\n\n【用户偏好】（仅供参考）\n${injections.map(i => `- ${i}`).join('\n')}`
      : ''
  }

  /**
   * 清除用户偏好
   */
  static async clearPreference(userId: string, projectId?: string): Promise<void> {
    const where: any = { userId }
    if (projectId) {
      where.projectId = projectId
    } else {
      where.projectId = null
    }

    await prisma.userPreferenceModel.deleteMany({ where })
  }
}