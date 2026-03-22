/**
 * Draft Service - 草稿管理服务
 * 负责 Agent 产出物的草稿存储、确认、修改流程
 */

import { prisma } from '../infrastructure/storage/storage'

export interface DraftInput {
  projectId: string
  stage: string  // character_analysis, storyboard, image_generation, video_generation
  data: any      // 结构化数据
  summary?: string
}

export interface DraftOutput {
  id: string
  projectId: string
  stage: string
  status: string
  data: any
  summary: string | null
  userModifications: any | null
  createdAt: Date
  updatedAt: Date
}

export class DraftService {

  /**
   * 创建草稿
   */
  async createDraft(input: DraftInput): Promise<DraftOutput> {
    const draft = await prisma.draft.create({
      data: {
        projectId: input.projectId,
        stage: input.stage,
        status: 'DRAFT',
        data: input.data,
        summary: input.summary || this.generateSummary(input.stage, input.data)
      }
    })

    return this.toOutput(draft)
  }

  /**
   * 获取项目的草稿
   */
  async getProjectDrafts(projectId: string): Promise<DraftOutput[]> {
    const drafts = await prisma.draft.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })

    return drafts.map(d => this.toOutput(d))
  }

  /**
   * 获取指定阶段的最新草稿
   */
  async getLatestDraft(projectId: string, stage: string): Promise<DraftOutput | null> {
    const draft = await prisma.draft.findFirst({
      where: { projectId, stage },
      orderBy: { createdAt: 'desc' }
    })

    return draft ? this.toOutput(draft) : null
  }

  /**
   * 获取草稿详情
   */
  async getDraft(draftId: string): Promise<DraftOutput | null> {
    const draft = await prisma.draft.findUnique({
      where: { id: draftId }
    })

    return draft ? this.toOutput(draft) : null
  }

  /**
   * 确认草稿（用户确认后调用）
   */
  async confirmDraft(draftId: string, modifications?: any): Promise<DraftOutput> {
    const draft = await prisma.draft.update({
      where: { id: draftId },
      data: {
        status: 'CONFIRMED',
        userModifications: modifications || null
      }
    })

    return this.toOutput(draft)
  }

  /**
   * 拒绝草稿
   */
  async rejectDraft(draftId: string, feedback?: string): Promise<DraftOutput> {
    const draft = await prisma.draft.update({
      where: { id: draftId },
      data: {
        status: 'REJECTED',
        userModifications: feedback ? { feedback } : undefined
      }
    })

    return this.toOutput(draft)
  }

  /**
   * 请求修改（用户反馈后重新生成）
   */
  async markRevision(draftId: string, feedback: string): Promise<DraftOutput> {
    const draft = await prisma.draft.update({
      where: { id: draftId },
      data: {
        status: 'REVISED',
        userModifications: { feedback }
      }
    })

    return this.toOutput(draft)
  }

  /**
   * 删除草稿
   */
  async deleteDraft(draftId: string): Promise<void> {
    await prisma.draft.delete({
      where: { id: draftId }
    })
  }

  /**
   * 根据确认状态获取草稿
   */
  async getDraftsByStatus(projectId: string, status: string): Promise<DraftOutput[]> {
    const drafts = await prisma.draft.findMany({
      where: { projectId, status },
      orderBy: { createdAt: 'desc' }
    })

    return drafts.map(d => this.toOutput(d))
  }

  /**
   * 生成摘要
   */
  private generateSummary(stage: string, data: any): string {
    switch (stage) {
      case 'character_analysis':
        const chars = data.characters || data
        return `角色设定：${Array.isArray(chars) ? chars.length : 0} 个角色`

      case 'storyboard':
        const shots = data.shots || data
        return `分镜脚本：${Array.isArray(shots) ? shots.length : 0} 个分镜`

      case 'image_generation':
        const images = data.images || data
        return `图片生成：${Array.isArray(images) ? images.length : 0} 张图片`

      case 'video_generation':
        return '视频生成：已完成'

      default:
        return '待处理'
    }
  }

  /**
   * 转换为输出格式
   */
  private toOutput(draft: any): DraftOutput {
    return {
      id: draft.id,
      projectId: draft.projectId,
      stage: draft.stage,
      status: draft.status,
      data: draft.data,
      summary: draft.summary,
      userModifications: draft.userModifications,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt
    }
  }
}

export const draftService = new DraftService()