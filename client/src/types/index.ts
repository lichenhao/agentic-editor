// 工作产物类型
export type ProductType =
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'TEXT'
  | 'JSON'
  | 'CODE'
  | 'STORYBOARD'
  | 'SCRIPT'
  | 'ASSET'

// 消息角色
export type MessageRole = 'user' | 'assistant' | 'system'

// 消息接口
export interface Message {
  id: string
  sessionId?: string
  employeeId?: string // Agent类型: director, asset, storyboard, video, editing
  role: MessageRole
  content: string
  createdAt: string
  order: string // BigInt 转字符串
  toolCalls?: any
  attachments?: any
}

// 工作产物接口
export interface WorkProduct {
  id: string
  projectId: string
  sessionId: string
  type: ProductType
  name: string
  description?: string
  mimeType?: string
  content?: string
  storageKey?: string
  sourceMessageId?: string
  creatorAgentId?: string
  metadata?: any
  createdAt: string
  updatedAt: string
}

// 项目接口
export interface Project {
  id: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
}

// 会话接口
export interface Session {
  id: string
  userId: string
  agentId: string
  status: string
  isGroupChat: boolean
  groupAgents?: string[]
  projectId?: string
  metadata?: any
  createdAt: string
  updatedAt: string
}

// 项目Agent绑定
export interface ProjectAgent {
  id: string
  projectId: string
  agentType: string
  status: string
  createdAt: string
}

// Agent配置（显示用）
export interface AgentConfig {
  name: string
  avatar: string
  color: string
  description: string
}

// Agent显示配置映射
export const AGENT_CONFIG: Record<string, AgentConfig> = {
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

// WebSocket消息类型（客户端发送）
export interface WSClientMessage {
  type: 'join_session' | 'message' | 'load_history' | 'load_products' | 'ping'
  sessionId?: string
  content?: string
  before?: string
  limit?: number
  attachments?: any[]
}

// WebSocket消息类型（服务端返回）
export interface WSServerMessage {
  type: string
  // 基础消息
  id?: string
  role?: string
  content?: string
  createdAt?: string
  employeeId?: string
  order?: string
  // 会话
  sessionId?: string
  projectAgents?: ProjectAgent[]
  messages?: Message[]
  hasMore?: boolean
  // 产物
  products?: WorkProduct[]
  product?: WorkProduct
  // 进度
  stage?: string
  summary?: string
  // 错误
  message?: string
}