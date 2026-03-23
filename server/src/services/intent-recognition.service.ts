/**
 * Intent Recognition Service - 用户意图识别服务
 * 分析用户输入的意图，决定下一步行动
 */

import { prisma } from '../infrastructure/database/prisma'
import { callClaude } from '../infrastructure/ai/claude'

// 意图类型
export type IntentType =
  | 'COMMUNICATION'      // 纯聊天/问候
  | 'PROGRESS_QUERY'     // 询问进度状态
  | 'DIRECTION_CHANGE'   // 修正任务方向/要求
  | 'NEW_REQUIREMENT'    // 新增需求
  | 'CONTINUE_TASK'      // 继续执行当前任务
  | 'APPROVAL_RESPONSE'  // 用户确认/拒绝
  | 'SELECTION_RESPONSE' // 用户选择响应
  | 'REVISION_REQUEST'   // 请求修改

// 意图分析结果
export interface UserIntent {
  type: IntentType
  confidence: number      // 置信度 0-1
  details: {
    originalInput: string
    taskContext?: {
      currentTaskId?: string
      currentStep?: number
      pendingApproval?: boolean
    }
    extractedRequirements?: string
    suggestedActions: string[]
  }
}

// 任务状态信息
interface TaskContextInfo {
  currentTaskId?: string
  currentStep?: number
  pendingApproval?: boolean
  totalTasks?: number
  completedTasks?: number
}

/**
 * 识别用户意图
 */
export async function recognizeIntent(
  userInput: string,
  sessionId: string
): Promise<UserIntent> {
  console.log(`[IntentRecognition] Analyzing intent for session: ${sessionId}`)

  // 1. 获取当前任务状态
  const taskContext = await getTaskContext(sessionId)

  // 2. 构建意图分析Prompt
  const prompt = buildIntentPrompt(userInput, taskContext)

  // 3. 调用LLM分析
  const systemPrompt = `你是一个用户意图分析助手。请根据用户输入和当前任务状态，分析用户的意图并返回结构化的分析结果。`
  const result = await callClaude(prompt, systemPrompt)

  // 4. 解析结果
  return parseIntentResult(result, userInput, taskContext)
}

/**
 * 获取当前会话的任务上下文
 */
async function getTaskContext(sessionId: string): Promise<TaskContextInfo> {
  // 获取会话信息（只有 projectId 字段，没有直接的项目关联）
  const session = await prisma.session.findUnique({
    where: { id: sessionId }
  })

  const metadata = session?.metadata as any
  const projectId = metadata?.projectId

  if (!projectId) {
    return {}
  }

  // 获取活跃任务
  const activeTasks = await prisma.task.findMany({
    where: {
      projectId,
      status: {
        in: ['PENDING', 'IN_PROGRESS', 'WAITING_APPROVAL']
      }
    }
  })

  // 获取已完成任务
  const completedTasks = await prisma.task.count({
    where: {
      projectId,
      status: 'COMPLETED'
    }
  })

  // 检查是否有等待确认的任务
  const waitingApprovalTask = activeTasks.find(t => t.status === 'WAITING_APPROVAL')

  return {
    pendingApproval: !!waitingApprovalTask,
    currentTaskId: waitingApprovalTask?.id,
    totalTasks: activeTasks.length + completedTasks,
    completedTasks
  }
}

/**
 * 构建意图分析Prompt
 */
function buildIntentPrompt(userInput: string, taskContext: TaskContextInfo): string {
  const contextStr = taskContext.pendingApproval
    ? `当前有任务等待您的确认。`
    : taskContext.totalTasks && taskContext.totalTasks > 0
      ? `当前有 ${taskContext.completedTasks}/${taskContext.totalTasks} 个任务已完成。`
      : `暂无进行中的任务。`

  return `你是一个用户意图分析助手。请分析用户输入的意图。

## 当前状态
${contextStr}

## 用户输入
"${userInput}"

## 意图类型定义
- COMMUNICATION: 纯聊天/问候（如"你好"、"谢谢"）
- PROGRESS_QUERY: 询问进度状态（如"进行到哪了"、"进度如何"）
- DIRECTION_CHANGE: 修正任务方向/要求（如"改成XX风格"、"不要YY"）
- NEW_REQUIREMENT: 新增需求（如"再加一个角色"、"再生成一个视频"）
- CONTINUE_TASK: 继续执行当前任务（如"继续"、"开始执行"）
- APPROVAL_RESPONSE: 用户确认或拒绝（如"好的"、"可以"、"不行"）
- SELECTION_RESPONSE: 用户选择响应（如选择列表中的某个选项）
- REVISION_REQUEST: 请求修改（如"修改一下"、"换个样式"）

## 输出要求
请返回以下JSON格式的分析结果（只返回JSON，不要其他内容）：
{
  "type": "意图类型",
  "confidence": 0.0-1.0之间的置信度,
  "details": {
    "extractedRequirements": "从输入中提取的关键需求（如果是新需求或修改）",
    "suggestedActions": ["建议的下一步动作"]
  }
}`
}

/**
 * 解析LLM返回的意图结果
 */
function parseIntentResult(
  result: string,
  originalInput: string,
  taskContext: TaskContextInfo
): UserIntent {
  try {
    // 提取JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return createDefaultIntent(originalInput, taskContext)
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      type: normalizeIntentType(parsed.type),
      confidence: parsed.confidence || 0.5,
      details: {
        originalInput,
        taskContext: {
          currentTaskId: taskContext.currentTaskId,
          pendingApproval: taskContext.pendingApproval
        },
        extractedRequirements: parsed.details?.extractedRequirements,
        suggestedActions: parsed.details?.suggestedActions || []
      }
    }
  } catch (error) {
    console.error('[IntentRecognition] Parse error:', error)
    return createDefaultIntent(originalInput, taskContext)
  }
}

/**
 * 标准化意图类型
 */
function normalizeIntentType(type: string): IntentType {
  const typeMap: Record<string, IntentType> = {
    'communication': 'COMMUNICATION',
    'progress_query': 'PROGRESS_QUERY',
    'direction_change': 'DIRECTION_CHANGE',
    'new_requirement': 'NEW_REQUIREMENT',
    'continue_task': 'CONTINUE_TASK',
    'approval_response': 'APPROVAL_RESPONSE',
    'selection_response': 'SELECTION_RESPONSE',
    'revision_request': 'REVISION_REQUEST'
  }

  return typeMap[type.toLowerCase()] || 'CONTINUE_TASK'
}

/**
 * 创建默认意图（无法识别时）
 */
function createDefaultIntent(
  originalInput: string,
  taskContext: TaskContextInfo
): UserIntent {
  // 如果有等待确认的任务，默认按确认处理
  if (taskContext.pendingApproval) {
    return {
      type: 'APPROVAL_RESPONSE',
      confidence: 0.5,
      details: {
        originalInput,
        taskContext: {
          currentTaskId: taskContext.currentTaskId,
          pendingApproval: true
        },
        suggestedActions: ['process_approval']
      }
    }
  }

  // 否则默认继续执行
  return {
    type: 'CONTINUE_TASK',
    confidence: 0.3,
    details: {
      originalInput,
      taskContext: {
        currentTaskId: taskContext.currentTaskId,
        pendingApproval: taskContext.pendingApproval
      },
      suggestedActions: ['continue_execution']
    }
  }
}

/**
 * 根据意图类型获取处理建议
 */
export function getSuggestedResponse(intent: UserIntent): {
  shouldContinueExecution: boolean
  shouldRequestApproval: boolean
  message?: string
} {
  switch (intent.type) {
    case 'COMMUNICATION':
      return {
        shouldContinueExecution: false,
        shouldRequestApproval: false,
        message: '处理日常沟通'
      }

    case 'PROGRESS_QUERY':
      return {
        shouldContinueExecution: false,
        shouldRequestApproval: false,
        message: '返回进度信息'
      }

    case 'DIRECTION_CHANGE':
    case 'NEW_REQUIREMENT':
      return {
        shouldContinueExecution: false,
        shouldRequestApproval: true,
        message: '需要您确认新的需求或修改方向'
      }

    case 'APPROVAL_RESPONSE':
      return {
        shouldContinueExecution: true,
        shouldRequestApproval: false,
        message: '处理用户确认'
      }

    case 'REVISION_REQUEST':
      return {
        shouldContinueExecution: false,
        shouldRequestApproval: true,
        message: '需要您确认修改内容'
      }

    case 'CONTINUE_TASK':
    case 'SELECTION_RESPONSE':
    default:
      return {
        shouldContinueExecution: true,
        shouldRequestApproval: false
      }
  }
}