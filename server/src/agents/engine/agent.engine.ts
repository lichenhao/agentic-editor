/**
 * Agent Engine
 * 新架构使用独立的 Agent 服务
 */

import { prisma } from '../../infrastructure/database/prisma'
import { createMessage } from '../../services/message.service'
import { directorAgent } from '../director/director.agent'
import type { AgentContext, AgentResult } from '../base/agent.interface'

// 重新导出新架构的核心组件
export { AgentProfileLoader } from '../loader/agent-profile.loader'
export { SkillLoader } from '../loader/skill.loader'
export { ProjectAgentService } from '../service/project-agent.service'
export { ResponseBuilder } from '../service/response-builder.service'
export { PreferenceService } from '../service/preference.service'
export { FeedbackProcessor } from '../service/feedback-processor.service'

// 保留旧接口兼容
export interface AgentConfig {
  type: string
  projectId?: string
}

export interface ProcessParams {
  sessionId: string
  userId: string
  agentId?: string
  message: string
  attachments?: any[]
  sendEvent: (event: any) => void
}

export const agentEngine = {
  process: async (params: ProcessParams): Promise<void> => {
    const { sessionId, agentId, message, sendEvent } = params

    console.log(`[AgentEngine] Processing session: ${sessionId}, agent: ${agentId || 'director'}, message: ${message.substring(0, 50)}...`)

    // 发送思考状态
    sendEvent({ type: 'thinking', stage: 'loading', content: '加载项目信息...' })

    try {
      // 1. 获取会话信息（包含 projectId）
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      })

      if (!session) {
        sendEvent({ type: 'error', message: '会话不存在' })
        return
      }

      const metadata = session.metadata as any
      const projectId = metadata?.projectId

      if (!projectId) {
        // 没有项目，直接返回简单响应
        const assistantMessage = await createMessage({
          sessionId,
          role: 'assistant',
          content: '我已收到您的消息。请先创建项目，我将帮助您制作短剧。',
          employeeId: agentId || 'director'
        })

        sendEvent({
          type: 'message',
          id: assistantMessage.id,
          role: 'assistant',
          content: assistantMessage.content,
          employeeId: agentId || 'director',
          createdAt: assistantMessage.createdAt.toISOString(),
          order: assistantMessage.order.toString()
        })
        sendEvent({ type: 'done', summary: '无项目会话完成' })
        return
      }

      // 2. 加载项目信息
      sendEvent({ type: 'thinking', stage: 'analyzing', content: '分析项目需求...' })

      const project = await prisma.project.findUnique({
        where: { id: projectId }
      })

      if (!project) {
        sendEvent({ type: 'error', message: '项目不存在' })
        return
      }

      // 3. 构建 Agent 上下文
      const context: AgentContext = {
        projectId,
        userId: params.userId,
        sessionId,
        task: null,
        level: 1,
        history: [],
        userFeedback: [],
        preferences: {},
        novelText: project.novelText || undefined,
        userInput: message,
        sendEvent  // 传入 WebSocket 广播函数
      }

      // 4. 执行 Director Agent
      sendEvent({ type: 'thinking', stage: 'processing', content: 'Director Agent 正在处理...' })

      const result: AgentResult = await directorAgent.execute(context)

      // 5. 发送 Agent 响应
      const responseContent = result.message || '处理完成'

      const assistantMessage = await createMessage({
        sessionId,
        role: 'assistant',
        content: responseContent,
        employeeId: agentId || 'director'
      })

      sendEvent({
        type: 'message',
        id: assistantMessage.id,
        role: 'assistant',
        content: responseContent,
        employeeId: agentId || 'director',
        createdAt: assistantMessage.createdAt.toISOString(),
        order: assistantMessage.order.toString(),
        metadata: result.output
      })

      // 6. 发送完成事件 - 只有不需要用户介入时才发送
      const requiresUserApproval = result.requiresApproval ||
        (result.output && result.output.waitingApproval) ||
        (result.output && result.output.pendingTasks > 0) ||
        (result.output && !result.output.allComplete)

      if (!requiresUserApproval) {
        sendEvent({ type: 'done', summary: result.message || '处理完成' })
      } else {
        console.log('[AgentEngine] Skipping done event - waiting for user approval or tasks in progress')
        // 广播当前任务状态
        if (result.output?.waitingApproval) {
          sendEvent({
            type: 'task_waiting_approval',
            message: result.message || '等待用户确认'
          })
        }
      }

    } catch (error: any) {
      console.error('[AgentEngine] Error:', error)

      // 发送错误消息
      const errorMessage = await createMessage({
        sessionId,
        role: 'assistant',
        content: `处理消息时发生错误: ${error.message}`,
        employeeId: agentId || 'director'
      })

      sendEvent({
        type: 'message',
        id: errorMessage.id,
        role: 'assistant',
        content: errorMessage.content,
        employeeId: agentId || 'director',
        createdAt: errorMessage.createdAt.toISOString(),
        order: errorMessage.order.toString()
      })

      sendEvent({ type: 'error', message: error.message })
    }
  },

  processMessage: async (sessionId: string, message: string) => {
    console.log('[AgentEngine Stub] processMessage called')
    return { response: 'Agent Engine 已更新，请使用新架构' }
  },

  // 占位方法 - 后续需要实现或从旧引擎迁移
  resumeSession: async (sessionId: string) => {
    console.log('[AgentEngine Stub] resumeSession called')
    return { success: true }
  },

  rejectSession: async (sessionId: string, feedback: string) => {
    console.log('[AgentEngine Stub] rejectSession called', feedback)
    return { success: true }
  },

  handleSelection: async (sessionId: string, stage: string, selectedIds: string[]) => {
    console.log('[AgentEngine Stub] handleSelection called', stage, selectedIds)
    return { success: true }
  },

  handleDraftConfirmation: async (sessionId: string, draftId: string, confirmed: boolean, modifications?: any) => {
    console.log('[AgentEngine Stub] handleDraftConfirmation called', draftId, confirmed)
    return { success: true }
  },

  handleDraftRevision: async (sessionId: string, draftId: string, feedback: string) => {
    console.log('[AgentEngine Stub] handleDraftRevision called', draftId, feedback)
    return { success: true }
  }
}

export function registerTool(name: string, handler: any) {
  console.log(`[AgentEngine Stub] registerTool: ${name}`)
}