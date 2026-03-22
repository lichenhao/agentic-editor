/**
 * Agent 统一响应接口
 * 支持：用户确认、信息输入、权限授予、任务完成、错误处理
 */

export type ResponseType =
  | 'message'           // 普通消息
  | 'confirmation'      // 需要用户确认
  | 'input_request'     // 需要用户提供信息
  | 'permission_grant'  // 需要用户授权
  | 'task_complete'     // 任务完成
  | 'error'             // 错误
  | 'task_update'       // 任务进度更新

export type DataType =
  | 'text'      // 文本
  | 'card'      // 卡片
  | 'list'      // 列表
  | 'form'      // 表单
  | 'image'     // 图片
  | 'video'     // 视频
  | 'table'     // 表格
  | 'code'      // 代码

export type UserAction =
  | 'confirm'          // 确认
  | 'reject'           // 拒绝
  | 'input'            // 输入
  | 'select'           // 选择
  | 'multiselect'      // 多选
  | 'grant_permission' // 授权

export interface ResponseField {
  name: string
  type: 'text' | 'select' | 'multiselect' | 'checkbox' | 'file' | 'textarea'
  label: string
  placeholder?: string
  options?: string[]
  required: boolean
  defaultValue?: any
}

export interface UserInteraction {
  action: UserAction
  fields?: ResponseField[]
  message?: string
}

export interface TaskInfo {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'waiting_approval'
  progress?: number
  message?: string
}

export interface DataPayload {
  type: DataType
  content?: any
  items?: any[]
  metadata?: Record<string, any>
}

export interface AgentResponse {
  // 响应类型
  type: ResponseType

  // 内容（用于展示）
  content: string

  // 数据（用于 UI 渲染）
  data?: DataPayload

  // 用户交互
  userInteraction?: UserInteraction

  // 任务信息
  task?: TaskInfo

  // 下一步建议
  nextActions?: string[]

  // 元数据
  metadata?: {
    agentType?: string
    projectId?: string
    timestamp?: string
    [key: string]: any
  }
}

/**
 * 错误响应
 */
export interface ErrorResponse extends AgentResponse {
  type: 'error'
  error: {
    code: string
    message: string
    details?: any
  }
}

/**
 * 确认请求
 */
export interface ConfirmationResponse extends AgentResponse {
  type: 'confirmation'
  userInteraction: {
    action: 'confirm' | 'reject' | 'select'
    fields?: ResponseField[]
    message: string
  }
  data: {
    type: 'card' | 'form' | 'list'
    content: any
  }
}

/**
 * 输入请求
 */
export interface InputRequestResponse extends AgentResponse {
  type: 'input_request'
  userInteraction: {
    action: 'input' | 'select' | 'multiselect'
    fields: ResponseField[]
  }
}

/**
 * 权限请求
 */
export interface PermissionRequestResponse extends AgentResponse {
  type: 'permission_grant'
  userInteraction: {
    action: 'grant_permission'
    fields?: ResponseField[]
    message: string
  }
  permission: {
    resource: string
    action: string
    reason?: string
  }
}