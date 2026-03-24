/**
 * Session Service - 会话管理服务
 * 支持 Secretary 自动分配和会话恢复
 */

import { prisma } from '../infrastructure/database/prisma'
import { AgentInstance, Session, AgentRole } from '@prisma/client'

export interface CreateSessionParams {
  userId: string
  title?: string
  secretaryType?: string  // 默认 'secretary'
}

export interface SessionWithDetails extends Session {
  secretary?: AgentInstance | null
  taskCount?: number
  contextCount?: number
}

export class SessionService {

  /**
   * 获取默认用户ID（如果不存在则创建）
   */
  async getOrCreateDefaultUser(): Promise<string> {
    // 查找默认用户
    const defaultUser = await prisma.user.findFirst({
      where: { email: 'default@example.com' }
    })

    if (defaultUser) {
      return defaultUser.id
    }

    // 创建默认用户
    const newUser = await prisma.user.create({
      data: {
        email: 'default@example.com',
        name: 'Default User'
      }
    })
    console.log(`[SessionService] Created default user: ${newUser.id}`)
    return newUser.id
  }

  /**
   * 创建会话 - 自动分配 Secretary Agent
   */
  async createSession(params: CreateSessionParams): Promise<SessionWithDetails> {
    let { userId, title, secretaryType = 'secretary' } = params

    console.log(`[SessionService] Creating session for user: ${userId}, secretary: ${secretaryType}`)

    // 0. 如果没有提供 userId，使用默认用户
    if (!userId || userId === 'default-user') {
      userId = await this.getOrCreateDefaultUser()
    } else {
      // 验证用户是否存在，不存在则创建
      const existingUser = await prisma.user.findUnique({ where: { id: userId } })
      if (!existingUser) {
        // 检查是否可以用 email 找到
        const userByEmail = await prisma.user.findUnique({ where: { email: userId } })
        if (userByEmail) {
          userId = userByEmail.id
        } else {
          // 创建新用户
          const newUser = await prisma.user.create({
            data: {
              email: userId.includes('@') ? userId : `${userId}@example.com`,
              name: userId
            }
          })
          userId = newUser.id
          console.log(`[SessionService] Created new user: ${newUser.id}`)
        }
      }
    }

    // 1. 创建会话
    const session = await prisma.session.create({
      data: {
        userId,
        title: title || '新会话',
        secretaryType,
        status: 'ACTIVE',
        contextSummary: null
      }
    })

    // 2. 创建 Secretary Agent 实例
    const secretary = await prisma.agentInstance.create({
      data: {
        agentType: secretaryType,
        sessionId: session.id,
        role: 'SECRETARY' as AgentRole,
        status: 'IDLE',
        context: {}
      }
    })

    console.log(`[SessionService] Session created: ${session.id}, Secretary: ${secretary.id}`)

    // 3. 返回会话详情
    return {
      ...session,
      secretary
    }
  }

  /**
   * 获取会话详情
   */
  async getSession(sessionId: string): Promise<SessionWithDetails | null> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        instances: {
          where: { role: AgentRole.SECRETARY },
          take: 1
        },
        tasks: {
          select: { id: true }
        },
        contexts: {
          select: { id: true }
        }
      }
    })

    if (!session) return null

    // 获取 secretary 实例
    const secretary = session.instances[0] || null

    return {
      ...session,
      secretary,
      taskCount: session.tasks.length,
      contextCount: session.contexts.length
    }
  }

  /**
   * 获取用户的所有会话
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    })
  }

  /**
   * 更新会话状态
   */
  async updateSessionStatus(sessionId: string, status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'): Promise<Session> {
    return prisma.session.update({
      where: { id: sessionId },
      data: { status }
    })
  }

  /**
   * 更新会话摘要（用于长会话压缩）
   */
  async updateContextSummary(sessionId: string, summary: string): Promise<Session> {
    return prisma.session.update({
      where: { id: sessionId },
      data: { contextSummary: summary }
    })
  }

  /**
   * 获取会话的 Secretary Agent
   */
  async getSecretary(sessionId: string): Promise<AgentInstance | null> {
    return prisma.agentInstance.findFirst({
      where: {
        sessionId,
        role: AgentRole.SECRETARY
      }
    })
  }

  /**
   * 更新 Secretary Agent 状态
   */
  async updateSecretaryStatus(
    sessionId: string,
    status: 'IDLE' | 'RUNNING' | 'WAITING' | 'COMPLETED',
    context?: Record<string, any> | null
  ): Promise<AgentInstance | null> {
    const secretary = await this.getSecretary(sessionId)
    if (!secretary) return null

    const updateData: any = { status }
    if (context !== undefined) {
      updateData.context = context ?? {}
    }

    return prisma.agentInstance.update({
      where: { id: secretary.id },
      data: updateData
    })
  }

  /**
   * 创建会话快照（用于恢复）
   */
  async createSnapshot(sessionId: string, recoveryPoint: string): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) return

    // 收集上下文数据
    const contexts = await prisma.context.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    // 收集任务状态
    const tasks = await prisma.task.findMany({
      where: { sessionId }
    })

    // 收集 Agent 状态
    const agents = await prisma.agentInstance.findMany({
      where: { sessionId }
    })

    await prisma.sessionSnapshot.create({
      data: {
        sessionId,
        contextData: contexts,
        taskState: tasks,
        agentStates: agents.map(a => ({
          id: a.id,
          agentType: a.agentType,
          status: a.status,
          context: a.context
        })),
        recoveryPoint
      }
    })

    console.log(`[SessionService] Snapshot created for session: ${sessionId}, point: ${recoveryPoint}`)
  }

  /**
   * 从快照恢复会话
   */
  async restoreFromSnapshot(snapshotId: string): Promise<SessionWithDetails | null> {
    const snapshot = await prisma.sessionSnapshot.findUnique({
      where: { id: snapshotId }
    })

    if (!snapshot) return null

    // 恢复任务状态
    if (snapshot.taskState) {
      for (const task of snapshot.taskState as any[]) {
        await prisma.task.upsert({
          where: { id: task.id },
          update: {
            status: task.status as any,
            result: task.result,
            error: task.error
          },
          create: {
            id: task.id,
            sessionId: snapshot.sessionId,
            name: task.name,
            description: task.description,
            payload: task.payload,
            executionMode: task.executionMode || 'SERIAL',
            status: task.status as any,
            acceptanceCriteria: task.acceptanceCriteria,
            result: task.result,
            error: task.error
          }
        })
      }
    }

    // 恢复 Agent 状态
    if (snapshot.agentStates) {
      for (const agent of snapshot.agentStates as any[]) {
        await prisma.agentInstance.update({
          where: { id: agent.id },
          data: {
            status: agent.status,
            context: agent.context
          }
        })
      }
    }

    console.log(`[SessionService] Restored from snapshot: ${snapshotId}`)

    return this.getSession(snapshot.sessionId)
  }

  /**
   * 获取最新的恢复点
   */
  async getLatestRecoveryPoint(sessionId: string): Promise<string | null> {
    const snapshot = await prisma.sessionSnapshot.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      select: { recoveryPoint: true }
    })

    return snapshot?.recoveryPoint || null
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    // 删除相关数据（级联）
    await prisma.taskExecutionLog.deleteMany({ where: { sessionId } })
    await prisma.sessionSnapshot.deleteMany({ where: { sessionId } })
    await prisma.context.deleteMany({ where: { sessionId } })
    await prisma.workProduct.deleteMany({ where: { sessionId } })
    await prisma.attachment.deleteMany({ where: { sessionId } })
    await prisma.task.deleteMany({ where: { sessionId } })
    await prisma.agentInstance.deleteMany({ where: { sessionId } })
    await prisma.session.delete({ where: { id: sessionId } })

    console.log(`[SessionService] Session deleted: ${sessionId}`)
  }
}

export const sessionService = new SessionService()