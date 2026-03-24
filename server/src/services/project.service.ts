import { prisma } from '../infrastructure/database/prisma'

/**
 * 项目管理服务
 */
export class ProjectService {
  /**
   * 创建项目
   */
  async createProject(
    userId: string,
    name: string,
    description?: string,
    agentTeam?: any
  ): Promise<any> {
    return await prisma.project.create({
      data: {
        userId,
        name,
        description,
        agentTeam,
      },
    })
  }

  /**
   * 获取用户的所有项目
   */
  async getUserProjects(userId: string): Promise<any[]> {
    return await prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    })
  }

  /**
   * 获取项目详情
   */
  async getProject(projectId: string): Promise<any | null> {
    return await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        sessions: {
          orderBy: { updatedAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { sessions: true },
        },
      },
    })
  }

  /**
   * 更新项目
   */
  async updateProject(
    projectId: string,
    data: {
      name?: string
      description?: string
      agentTeam?: any
    }
  ): Promise<any> {
    return await prisma.project.update({
      where: { id: projectId },
      data,
    })
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    // 删除项目（级联删除会话）
    await prisma.project.delete({
      where: { id: projectId },
    })
  }

  /**
   * 获取项目下的会话列表
   */
  async getProjectSessions(projectId: string): Promise<any[]> {
    return await prisma.session.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { contexts: true, products: true },
        },
      },
    })
  }

  /**
   * 在项目中创建会话
   */
  async createSession(
    projectId: string,
    userId: string,
    title?: string,
    secretaryType: string = 'secretary'
  ): Promise<any> {
    return await prisma.session.create({
      data: {
        projectId,
        userId,
        title,
        secretaryType,
      },
    })
  }
}

// 导出单例
export const projectService = new ProjectService()