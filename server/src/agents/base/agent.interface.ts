/**
 * Agent 核心接口定义
 * 参考 OpenClaude 多层级 Agent 架构
 */

// Agent 类型
export type AgentType =
  | 'director'      // 主 Agent - 任务拆解和监督
  | 'chunking'      // 小说解析分片
  | 'analysis'      // 剧本分析
  | 'asset'         // 视觉资产
  | 'storyboard'    // 分镜脚本
  | 'video'         // 视频生成
  | 'editing'       // 智能剪辑
  | 'sub'           // 子任务 Agent

// Agent 状态
export type AgentStatus = 'IDLE' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED'

// Agent 执行状态
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

// 任务定义
export interface Task {
  id: string
  type: string
  name: string
  description: string
  status: string
  payload: any
  dependencies: string[]
  requireApproval: boolean
  [key: string]: any  // 允许 JSON 序列化
}

// Agent 上下文
export interface AgentContext {
  projectId: string
  userId: string
  sessionId?: string  // 用于 WebSocket 广播
  task: Task | null
  parentAgentId?: string
  level: number  // 1-3 层级
  history: AgentExecutionRecord[]
  userFeedback: string[]
  preferences: Record<string, any>  // 用户偏好
  novelText?: string
  blueprint?: any
  assets?: any[]
  shots?: any[]
  userInput?: string  // 用户原始输入
  sendEvent?: (event: any) => void  // WebSocket 广播函数
}

// Agent 执行记录
export interface AgentExecutionRecord {
  id: string
  taskId: string
  input: any
  output: any
  status: string
  error?: string
  duration?: number
  createdAt: Date
}

// Agent 执行结果
export interface AgentResult {
  success: boolean
  output: any
  nextTasks?: Task[]
  requiresApproval?: boolean
  message?: string
  subAgentIds?: string[]
  updatedContext?: Partial<AgentContext>
}

// 用户反馈
export interface UserFeedback {
  id: string
  projectId: string
  agentType: string
  taskType: string
  feedback: string
  approved: boolean
  createdAt: Date
}

// Agent 偏好设置（用于迭代学习）
export interface AgentPreference {
  style?: string        // 创作风格偏好
  tone?: string         // 语气偏好
  detailLevel?: string  // 细节程度
  focusAreas?: string[] // 重点关注领域
  exclusions?: string[] // 避免的内容
}

// Agent 初始化配置
export interface AgentConfig {
  type: AgentType
  projectId?: string
  parentAgentId?: string
  level?: number
  context?: Partial<AgentContext>
}

// 任务阶段配置
export interface TaskStageConfig {
  id: string
  type: string
  name: string
  description: string
  agentType: AgentType  // 对应的 Agent 类型
  requireApproval: boolean
  dependsOn: string[]
}

// 进度事件
export interface ProgressEvent {
  type: 'start' | 'stage_start' | 'stage_complete' | 'waiting_approval' | 'needs_revision' | 'complete' | 'error'
  message: string
  projectId: string
  stage: string
  data?: any
  timestamp: Date
}

// 工具调用结果
export interface ToolCall {
  name: string
  arguments: any
  result?: any
  error?: string
}