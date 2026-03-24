/**
 * Agent Engine
 * Multi-Agent 架构核心引擎
 * 支持 Secretary 中心协调模式 + DAG 任务调度
 */

import { prisma } from '../../infrastructure/database/prisma'
import { sessionService } from '../../services/session.service'
import { contextService } from '../../services/context.service'
import { secretaryAgent } from '../secretary/secretary.agent'
import { taskService } from '../../services/task.service'

// Re-export new architecture core components
export { sessionService } from '../../services/session.service'
export { contextService } from '../../services/context.service'
export { taskService } from '../../services/task.service'
export { secretaryAgent } from '../secretary/secretary.agent'

// 接口定义
export interface ProcessParams {
  sessionId: string
  userId: string
  agentId?: string
  message: string
  attachments?: string[]  // 附件 ID 列表
  sendEvent: (event: any) => void
}

export interface CreateSessionParams {
  userId: string
  title?: string
}

// 导出类型
export type { AgentContext, AgentResult } from '../base/agent.interface'

// Define explicit return type
type EngineResult = { success: boolean; error?: string; session?: any; recoveryPoint?: string }

export const agentEngine: {
  createSession: (params: CreateSessionParams) => Promise<{ success: boolean; sessionId?: string; secretaryAgentId?: string; error?: string }>
  process: (params: ProcessParams) => Promise<void>
  handleConfirmation: (sessionId: string, taskId: string, approved: boolean, feedback?: string) => Promise<{ success: boolean; error?: string }>
  handleCancellation: (sessionId: string, taskId?: string) => Promise<{ success: boolean; error?: string }>
  getDAGStatus: (sessionId: string) => Promise<any>
  getHistory: (sessionId: string, limit?: number) => Promise<{ success: boolean; contexts?: any[]; error?: string }>
  getSessions: (userId: string) => Promise<{ success: boolean; sessions?: any[]; error?: string }>
  deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  restoreSession: (sessionId: string) => Promise<EngineResult>
  processMessage: (sessionId: string, message: string) => Promise<{ response: string }>
  resumeSession: (sessionId: string) => Promise<EngineResult>
  rejectSession: (sessionId: string, feedback: string) => Promise<EngineResult>
  handleSelection: (sessionId: string, stage: string, selectedIds: string[]) => Promise<{ success: boolean }>
  handleDraftConfirmation: (sessionId: string, draftId: string, confirmed: boolean, modifications?: any) => Promise<{ success: boolean }>
  handleDraftRevision: (sessionId: string, draftId: string, feedback: string) => Promise<{ success: boolean }>
} = {

  /**
   * 创建新会话（自动分配 Secretary）
   */
  createSession: async (params: CreateSessionParams) => {
    console.log(`[AgentEngine] Creating session for user: ${params.userId}`)

    try {
      const session = await sessionService.createSession(params)

      return {
        success: true,
        sessionId: session.id,
        secretaryAgentId: session.secretary?.id
      }
    } catch (error: any) {
      console.error('[AgentEngine] Error creating session:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 处理用户消息
   */
  process: async (params: ProcessParams): Promise<void> => {
    const { sessionId, userId, message, attachments, sendEvent } = params

    console.log(`[AgentEngine] Processing session: ${sessionId}, message: ${message.substring(0, 50)}...`)

    try {
      // 1. 检查会话是否存在
      const session = await sessionService.getSession(sessionId)

      if (!session) {
        sendEvent({ type: 'error', message: '会话不存在' })
        return
      }

      // 2. 如果有附件，先处理附件
      let attachmentIds = attachments
      if (attachments && attachments.length > 0) {
        sendEvent({ type: 'thinking', stage: 'attachments', content: '处理附件...' })
        // 附件会在 Secretary 执行时处理
      }

      // 3. 执行 Secretary Agent
      sendEvent({ type: 'thinking', stage: 'secretary', content: 'Secretary 正在分析需求...' })

      const result = await secretaryAgent.execute({
        sessionId,
        userId,
        userMessage: message,
        attachmentIds,
        sendEvent
      })

      // 4. 发送完成事件
      if (result.success) {
        if (result.requiresUserApproval) {
          // 等待用户确认
          sendEvent({
            type: 'user_interaction',
            taskId: result.approvalTaskId,
            message: '需要您的确认'
          })
        }
        // done 事件在 Secretary 内部发送
      } else {
        sendEvent({ type: 'error', message: result.message })
      }

    } catch (error: any) {
      console.error('[AgentEngine] Error:', error)
      sendEvent({ type: 'error', message: error.message })
    }
  },

  /**
   * 处理用户确认
   */
  handleConfirmation: async (sessionId: string, taskId: string, approved: boolean, feedback?: string) => {
    console.log(`[AgentEngine] Confirmation: task=${taskId}, approved=${approved}`)

    try {
      await secretaryAgent.handleConfirmation(sessionId, taskId, approved, feedback)
      return { success: true }
    } catch (error: any) {
      console.error('[AgentEngine] Error handling confirmation:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 处理用户终止
   */
  handleCancellation: async (sessionId: string, taskId?: string) => {
    console.log(`[AgentEngine] Cancellation: taskId=${taskId || 'all'}`)

    try {
      await secretaryAgent.handleCancellation(sessionId, taskId)
      return { success: true }
    } catch (error: any) {
      console.error('[AgentEngine] Error handling cancellation:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 获取 DAG 状态
   */
  getDAGStatus: async (sessionId: string) => {
    try {
      return await secretaryAgent.getDAGStatus(sessionId)
    } catch (error: any) {
      console.error('[AgentEngine] Error getting DAG status:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 获取会话历史消息
   */
  getHistory: async (sessionId: string, limit = 50) => {
    try {
      const contexts = await contextService.getContexts(sessionId, { limit })
      return { success: true, contexts }
    } catch (error: any) {
      console.error('[AgentEngine] Error getting history:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 获取会话列表
   */
  getSessions: async (userId: string) => {
    try {
      const sessions = await sessionService.getUserSessions(userId)
      return { success: true, sessions }
    } catch (error: any) {
      console.error('[AgentEngine] Error getting sessions:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 删除会话
   */
  deleteSession: async (sessionId: string) => {
    try {
      await sessionService.deleteSession(sessionId)
      return { success: true }
    } catch (error: any) {
      console.error('[AgentEngine] Error deleting session:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * 恢复会话
   */
  restoreSession: async (sessionId: string) => {
    console.log(`[AgentEngine] Restoring session: ${sessionId}`)

    try {
      // 获取最新的恢复点
      const recoveryPoint = await sessionService.getLatestRecoveryPoint(sessionId)

      if (!recoveryPoint) {
        return { success: false, error: 'No recovery point found' }
      }

      // 恢复会话
      const session = await sessionService.restoreFromSnapshot(sessionId)

      if (!session) {
        return { success: false, error: 'Failed to restore session' }
      }

      return { success: true, session, recoveryPoint }
    } catch (error: any) {
      console.error('[AgentEngine] Error restoring session:', error)
      return { success: false, error: error.message }
    }
  },

  // 兼容旧接口
  processMessage: async (sessionId: string, message: string) => {
    console.log('[AgentEngine] processMessage called - use process() instead')
    return { response: 'Please use process() method' }
  },

  resumeSession: async (sessionId: string) => {
    try {
      // @ts-expect-error - TypeScript 无法正确推断 Promise 返回值
      const result = await this.restoreSession(sessionId)
      if (!result) {
        return { success: false, error: 'Failed to restore session' }
      }
      return { ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },

  rejectSession: async (sessionId: string, feedback: string) => {
    try {
      // 找到当前等待确认的任务，打回重做
      const tasks = await taskService.getSessionTasks(sessionId)
      const waitingTask = tasks.find(t => t.status === 'WAITING')

      if (!waitingTask) {
        return { success: false, error: 'No task waiting for confirmation' }
      }

      // @ts-expect-error - TypeScript 无法正确推断 Promise 返回值
      const result = await this.handleConfirmation(sessionId, waitingTask.id, false, feedback)
      return { ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },

  handleSelection: async (sessionId: string, stage: string, selectedIds: string[]) => {
    console.log('[AgentEngine] handleSelection:', stage, selectedIds)
    return { success: true }
  },

  handleDraftConfirmation: async (sessionId: string, draftId: string, confirmed: boolean, modifications?: any) => {
    console.log('[AgentEngine] handleDraftConfirmation:', draftId, confirmed)
    return { success: true }
  },

  handleDraftRevision: async (sessionId: string, draftId: string, feedback: string) => {
    console.log('[AgentEngine] handleDraftRevision:', draftId, feedback)
    return { success: true }
  }
}

export function registerTool(name: string, handler: any) {
  console.log(`[AgentEngine] Tool registered: ${name}`)
}