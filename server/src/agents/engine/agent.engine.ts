/**
 * Agent Engine
 * 新架构使用独立的 Agent 服务
 */

import { prisma } from '../../infrastructure/database/prisma'
import { createMessage } from '../../services/message.service'

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

    console.log(`[AgentEngine] Processing session: ${sessionId}, agent: ${agentId || 'default'}, message: ${message.substring(0, 50)}...`)

    // 发送思考状态
    sendEvent({ type: 'thinking', stage: 'understanding', content: '理解用户意图...' })

    // 创建助手消息并保存到数据库
    const assistantMessage = await createMessage({
      sessionId,
      role: 'assistant',
      content: '我已收到您的消息。Agent Engine 正在重构中，完整功能稍后可用。',
      employeeId: agentId || 'director'
    })

    // 发送助手消息（带 employeeId）
    sendEvent({
      type: 'message',
      id: assistantMessage.id,
      role: 'assistant',
      content: assistantMessage.content,
      employeeId: agentId || 'director',
      createdAt: assistantMessage.createdAt.toISOString(),
      order: assistantMessage.order.toString()
    })

    sendEvent({ type: 'done', summary: '消息已接收' })
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