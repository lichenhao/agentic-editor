// 工作产物类型（对应 Prisma ProductType）
export type ProductType = 'TEXT' | 'CODE' | 'FILE' | 'IMAGE' | 'VIDEO' | 'DATA'

// 消息角色（对应 Context role）
export type MessageRole = 'user' | 'assistant' | 'system'

// 消息接口（对应 Context 表）
export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  sourceAgent?: string // 产生此上下文的 Agent 类型: secretary, specialist, tool
  metadata?: any
  createdAt: string
}

// 工作产物接口（对应 WorkProduct 表）
export interface WorkProduct {
  id: string
  sessionId: string
  taskId?: string
  agentType: string // 产生此产出的 Agent 类型
  type: ProductType
  name: string
  content?: string
  storageKey?: string
  metadata?: any
  acceptanceStatus?: string // PENDING, APPROVED, REJECTED
  createdAt: string
  updatedAt: string
}

// 会话接口（对应 Session 表）
export interface Session {
  id: string
  userId: string
  title?: string
  secretaryType: string // 当前负责的 Secretary Agent 类型，默认 'secretary'
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  contextSummary?: string
  createdAt: string
  updatedAt: string
}

// 任务接口（对应 Task 表）
export interface Task {
  id: string
  sessionId: string
  name: string
  description?: string
  executionMode: 'SERIAL' | 'PARALLEL' | 'HYBRID'
  status: 'PENDING' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  payload?: any
  result?: any
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

// Agent 实例接口（对应 AgentInstance 表）
export interface AgentInstance {
  id: string
  agentType: string // secretary, specialist, tool
  sessionId: string
  role: 'SECRETARY' | 'SPECIALIST' | 'TOOL'
  status: 'IDLE' | 'RUNNING' | 'WAITING' | 'COMPLETED'
  context?: any
  createdAt: string
  updatedAt: string
}

// Agent配置（显示用）
export interface AgentConfig {
  name: string
  avatar: string
  color: string
  description: string
}

// Agent显示配置映射（适配扁平化架构）
export const AGENT_CONFIG: Record<string, AgentConfig> = {
  'secretary': {
    name: '智能秘书',
    avatar: '📋',
    color: '#9333ea',
    description: '负责需求分析和任务分配'
  },
  'specialist': {
    name: '领域专家',
    avatar: '🎯',
    color: '#3b82f6',
    description: '负责专业领域执行'
  },
  'tool': {
    name: '工具人',
    avatar: '🔧',
    color: '#10b981',
    description: '执行简单快速任务'
  },
  // 兼容旧版（视频制作流程）
  'director': {
    name: '总导演',
    avatar: '🎬',
    color: '#9333ea',
    description: '负责需求分析和任务分发'
  },
  'thinking': {
    name: '工作中',
    avatar: '⚙️',
    color: '#6b7280',
    description: 'Agent 工作中'
  },
  'asset': {
    name: '美术Agent',
    avatar: '🎨',
    color: '#3b82f6',
    description: '生成角色和场景图片'
  },
  'storyboard': {
    name: '分镜Agent',
    avatar: '📝',
    color: '#10b981',
    description: '创建故事板和分镜脚本'
  },
  'video': {
    name: '视频Agent',
    avatar: '🎥',
    color: '#f59e0b',
    description: '生成视频片段'
  },
  'editing': {
    name: '剪辑Agent',
    avatar: '✂️',
    color: '#ef4444',
    description: '剪辑和合成最终视频'
  }
}

// WebSocket消息类型（客户端发送 - 适配新架构）
export interface WSClientMessage {
  type:
    | 'CREATE_SESSION'
    | 'SEND_MESSAGE'
    | 'JOIN_SESSION'
    | 'GET_HISTORY'
    | 'GET_DAG_STATUS'
    | 'GET_PRODUCTS'
    | 'CONFIRM_TASK'
    | 'REJECT_TASK'
    | 'CANCEL_TASK'
    | 'UPLOAD_ATTACHMENT'
    | 'ping'
  payload?: any
  sessionId?: string
  content?: string
  taskId?: string
  approved?: boolean
  feedback?: string
  reason?: string
  before?: string
  limit?: number
  attachments?: any[]
}

// WebSocket消息类型（服务端返回 - 适配新架构）
export interface WSServerMessage {
  type: string
  // 基础消息
  id?: string
  role?: string
  content?: string
  sourceAgent?: string
  createdAt?: string
  // 会话
  sessionId?: string
  payload?: any
  // 任务
  taskId?: string
  taskStatus?: string
  // 进度/思考状态
  stage?: string
  summary?: string
  // 产物
  products?: WorkProduct[]
  product?: WorkProduct
  // 消息列表
  messages?: Message[]
  // 历史
  contexts?: Message[]
  hasMore?: boolean
  // DAG 状态
  dagStatus?: {
    nodes: any[]
    edges: any[]
    executable: string[]
  }
  // 错误
  message?: string
  code?: string
}

// Secretary 思考状态（用于显示状态卡片）
export interface ThinkingStatus {
  stage: string // analyzing, planning, creating, executing, reporting
  content: string
}

// 任务进度信息（适配 DAG 架构）
export interface TaskInfo {
  id: string
  name: string
  description?: string
  status: 'PENDING' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  executionMode: 'SERIAL' | 'PARALLEL' | 'HYBRID'
  result?: any
  error?: string
  startedAt?: string
  completedAt?: string
  progress?: number
  progressMessage?: string
}