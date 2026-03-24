/**
 * Attachment Service - 附件管理服务
 * 管理用户上传的附件
 */

import { prisma } from '../infrastructure/database/prisma'

class AttachmentService {

  /**
   * 获取附件
   */
  async getAttachment(attachmentId: string): Promise<any | null> {
    return prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        shards: {
          orderBy: { index: 'asc' }
        }
      }
    })
  }

  /**
   * 创建附件记录
   */
  async createAttachment(data: {
    sessionId: string
    uploaderId: string
    fileName: string
    fileType: string
    fileSize: number
    storageType: string
    storagePath: string
  }): Promise<any> {
    return prisma.attachment.create({
      data: {
        ...data,
        status: 'PENDING'
      }
    })
  }

  /**
   * 更新附件状态
   */
  async updateAttachmentStatus(attachmentId: string, status: string): Promise<any> {
    return prisma.attachment.update({
      where: { id: attachmentId },
      data: { status }
    })
  }

  /**
   * 获取会话的附件列表
   */
  async getSessionAttachments(sessionId: string): Promise<any[]> {
    return prisma.attachment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    })
  }
}

export const attachmentService = new AttachmentService()