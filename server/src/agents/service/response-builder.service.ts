/**
 * Response Builder - 构建统一格式的 Agent 响应
 * 支持：消息、确认、输入请求、权限请求、任务完成、错误
 */

import {
  type AgentResponse,
  type ResponseType,
  type DataType,
  type UserAction,
  type ResponseField,
  type TaskInfo,
  type DataPayload
} from '../base/response.interface'

export class ResponseBuilder {
  private response: AgentResponse

  private constructor() {
    this.response = {
      type: 'message',
      content: '',
      metadata: {
        timestamp: new Date().toISOString()
      }
    }
  }

  static create(): ResponseBuilder {
    return new ResponseBuilder()
  }

  // ============================================
  // 基础设置
  // ============================================

  type(type: ResponseType): this {
    this.response.type = type
    return this
  }

  content(content: string): this {
    this.response.content = content
    return this
  }

  data(type: DataType, content: any): this {
    this.response.data = {
      type,
      content
    }
    return this
  }

  task(task: TaskInfo): this {
    this.response.task = task
    return this
  }

  nextActions(actions: string[]): this {
    this.response.nextActions = actions
    return this
  }

  metadata(key: string, value: any): this {
    this.response.metadata = {
      ...this.response.metadata,
      [key]: value
    }
    return this
  }

  // ============================================
  // 便捷方法
  // ============================================

  /**
   * 普通消息
   */
  static message(content: string, data?: { type: DataType; content: any }): AgentResponse {
    const builder = ResponseBuilder.create()
      .type('message')
      .content(content)

    if (data) {
      builder.response.data = {
        type: data.type,
        content: data.content
      }
    }

    return builder.build()
  }

  /**
   * 确认请求（需要用户确认）
   */
  static confirmation(
    content: string,
    data: { type: DataType; content: any },
    options?: {
      fields?: ResponseField[]
      actions?: string[]
    }
  ): AgentResponse {
    const builder = ResponseBuilder.create()
      .type('confirmation')
      .content(content)
      .data(data.type, data.content)

    if (options?.fields) {
      builder.response.userInteraction = {
        action: 'confirm',
        fields: options.fields,
        message: content
      }
    }

    if (options?.actions) {
      builder.nextActions(options.actions)
    }

    return builder.build()
  }

  /**
   * 输入请求（需要用户提供信息）
   */
  static inputRequest(
    content: string,
    fields: ResponseField[],
    nextActions?: string[]
  ): AgentResponse {
    return ResponseBuilder.create()
      .type('input_request')
      .content(content)
      .setUserInteraction('input', fields)
      .nextActions(nextActions || [])
      .build()
  }

  /**
   * 选择请求（需要用户选择）
   */
  static selection(
    content: string,
    options: string[],
    fieldName: string = 'selection',
    label: string = '请选择'
  ): AgentResponse {
    return ResponseBuilder.create()
      .type('input_request')
      .content(content)
      .setUserInteraction('select', [
        {
          name: fieldName,
          type: 'select',
          label,
          options,
          required: true
        }
      ])
      .build()
  }

  /**
   * 权限请求
   */
  static permissionGrant(
    content: string,
    permission: { resource: string; action: string; reason?: string },
    fields?: ResponseField[]
  ): AgentResponse {
    return ResponseBuilder.create()
      .type('permission_grant')
      .content(content)
      .setUserInteraction('grant_permission', fields, content)
      .build()
  }

  /**
   * 任务完成
   */
  static taskComplete(
    content: string,
    task: TaskInfo,
    data?: { type: DataType; content: any }
  ): AgentResponse {
    const builder = ResponseBuilder.create()
      .type('task_complete')
      .content(content)
      .task({ ...task, status: 'completed' })

    if (data) {
      builder.data(data.type, data.content)
    }

    return builder.build()
  }

  /**
   * 任务进度更新
   */
  static taskUpdate(
    content: string,
    task: TaskInfo
  ): AgentResponse {
    return ResponseBuilder.create()
      .type('task_update')
      .content(content)
      .task(task)
      .build()
  }

  /**
   * 错误
   */
  static error(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    details?: any
  ): AgentResponse {
    return ResponseBuilder.create()
      .type('error')
      .content(message)
      .build()
  }

  // ============================================
  // 私有方法
  // ============================================

  private setUserInteraction(
    action: UserAction,
    fields?: ResponseField[],
    message?: string
  ): this {
    this.response.userInteraction = {
      action,
      fields,
      message
    }
    return this
  }

  build(): AgentResponse {
    return this.response
  }
}