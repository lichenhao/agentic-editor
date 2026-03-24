/**
 * DAG Scheduler - DAG 任务调度器
 * 支持串行/并行执行、打回重做、用户介入
 */

import { ExecutionMode } from '@prisma/client'
import { taskService } from '../../services/task.service'
import { contextService } from '../../services/context.service'

// 任务执行回调类型
type TaskExecutor = (taskId: string, payload: any) => Promise<any>

// 事件回调类型
type EventCallback = (event: SchedulerEvent) => void

export interface SchedulerEvent {
  type: 'task_start' | 'task_complete' | 'task_fail' | 'task_wait' | 'all_complete' | 'error'
  taskId?: string
  message: string
  data?: any
}

export interface DAGSchedulerOptions {
  maxParallel?: number
  defaultTimeout?: number
  enableRetry?: boolean
  maxRetries?: number
}

export class DAGScheduler {
  private sessionId: string
  private options: DAGSchedulerOptions
  private taskExecutor: TaskExecutor | null = null
  private eventCallback: EventCallback | null = null
  private running = false
  private taskResults: Map<string, any> = new Map()

  constructor(sessionId: string, options: DAGSchedulerOptions = {}) {
    this.sessionId = sessionId
    this.options = {
      maxParallel: options.maxParallel || 3,
      defaultTimeout: options.defaultTimeout || 300000, // 5 分钟
      enableRetry: options.enableRetry ?? true,
      maxRetries: options.maxRetries || 3
    }
  }

  /**
   * 设置任务执行器
   */
  setTaskExecutor(executor: TaskExecutor): void {
    this.taskExecutor = executor
  }

  /**
   * 设置事件回调
   */
  setEventCallback(callback: EventCallback): void {
    this.eventCallback = callback
  }

  /**
   * 广播事件
   */
  private emit(event: SchedulerEvent): void {
    console.log(`[DAGScheduler] Event: ${event.type}, ${event.message}`)
    if (this.eventCallback) {
      this.eventCallback(event)
    }
  }

  /**
   * 执行 DAG
   */
  async execute(): Promise<void> {
    if (this.running) {
      console.warn('[DAGScheduler] Already running')
      return
    }

    this.running = true
    console.log(`[DAGScheduler] Starting execution for session: ${this.sessionId}`)

    try {
      // 验证 DAG 无环
      const isValid = await taskService.validateNoCycle(this.sessionId)
      if (!isValid) {
        throw new Error('DAG contains cycles')
      }

      // 主执行循环
      await this.executionLoop()

    } catch (error: any) {
      console.error('[DAGScheduler] Execution error:', error)
      this.emit({
        type: 'error',
        message: error.message
      })
    } finally {
      this.running = false
    }
  }

  /**
   * 执行循环
   */
  private async executionLoop(): Promise<void> {
    let hasChanges = true

    while (hasChanges && this.running) {
      hasChanges = false

      // 获取可执行任务
      const executableTasks = await taskService.getExecutableTasks(this.sessionId)

      if (executableTasks.length === 0) {
        // 检查是否全部完成
        const allComplete = await this.checkAllComplete()
        if (allComplete) {
          this.emit({
            type: 'all_complete',
            message: 'All tasks completed'
          })
          break
        }

        // 有任务在运行，等待
        await this.wait(1000)
        continue
      }

      // 按执行模式分组
      const serialTasks = executableTasks.filter(t => t.executionMode === ExecutionMode.SERIAL)
      const parallelTasks = executableTasks.filter(t => t.executionMode === ExecutionMode.PARALLEL)
      const hybridTasks = executableTasks.filter(t => t.executionMode === ExecutionMode.HYBRID)

      // 执行串行任务（一次一个）
      if (serialTasks.length > 0) {
        const task = serialTasks[0]
        await this.executeTask(task)
        hasChanges = true
      }

      // 执行并行任务
      if (parallelTasks.length > 0) {
        const toExecute = parallelTasks.slice(0, this.options.maxParallel!)
        await Promise.all(toExecute.map(t => this.executeTask(t)))
        hasChanges = true
      }

      // 执行混合任务（根据依赖关系）
      if (hybridTasks.length > 0) {
        await this.executeHybridTasks(hybridTasks)
        hasChanges = true
      }

      // 短暂等待
      await this.wait(100)
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: any): Promise<void> {
    console.log(`[DAGScheduler] Executing task: ${task.name} (${task.id})`)

    // 记录开始
    await taskService.startTask(task.id)

    this.emit({
      type: 'task_start',
      taskId: task.id,
      message: `Starting task: ${task.name}`
    })

    // 记录到上下文
    await contextService.addContext({
      sessionId: this.sessionId,
      role: 'agent',
      sourceAgent: 'scheduler',
      content: `开始执行任务: ${task.name}`,
      metadata: { taskId: task.id, type: 'task_start' }
    })

    try {
      // 执行任务
      let result: any = null
      if (this.taskExecutor) {
        result = await this.executeWithTimeout(
          () => this.taskExecutor!(task.id, task.payload),
          this.options.defaultTimeout!
        )
      } else {
        console.warn('[DAGScheduler] No task executor set, skipping')
        result = { skipped: true }
      }

      // 记录结果
      this.taskResults.set(task.id, result)

      // 标记完成
      await taskService.completeTask(task.id, result)

      this.emit({
        type: 'task_complete',
        taskId: task.id,
        message: `Task completed: ${task.name}`,
        data: result
      })

      // 记录到上下文
      await contextService.addContext({
        sessionId: this.sessionId,
        role: 'agent',
        sourceAgent: 'scheduler',
        content: `任务完成: ${task.name}`,
        metadata: { taskId: task.id, type: 'task_complete', result }
      })

    } catch (error: any) {
      console.error(`[DAGScheduler] Task failed: ${task.name}`, error)

      // 重试逻辑
      if (this.options.enableRetry) {
        // TODO: 实现重试逻辑
      }

      await taskService.failTask(task.id, error.message)

      this.emit({
        type: 'task_fail',
        taskId: task.id,
        message: `Task failed: ${task.name}, error: ${error.message}`
      })

      // 记录到上下文
      await contextService.addContext({
        sessionId: this.sessionId,
        role: 'agent',
        sourceAgent: 'scheduler',
        content: `任务失败: ${task.name}, 错误: ${error.message}`,
        metadata: { taskId: task.id, type: 'task_fail', error: error.message }
      })
    }
  }

  /**
   * 执行混合模式任务
   */
  private async executeHybridTasks(tasks: any[]): Promise<void> {
    // 构建依赖图
    const dependencyMap = new Map<string, string[]>()
    for (const task of tasks) {
      dependencyMap.set(task.id, task.dependencies)
    }

    // 按层级执行
    const levels = this.computeLevels(tasks, dependencyMap)

    for (const level of levels) {
      const levelTasks = tasks.filter(t => level.includes(t.id))
      await Promise.all(levelTasks.map(t => this.executeTask(t)))
    }
  }

  /**
   * 计算任务层级
   */
  private computeLevels(tasks: any[], dependencyMap: Map<string, string[]>): string[][] {
    const levels: string[][] = []
    const assigned = new Set<string>()
    const remaining = new Set(tasks.map(t => t.id))

    while (remaining.size > 0) {
      const currentLevel: string[] = []

      for (const taskId of remaining) {
        const deps = dependencyMap.get(taskId) || []
        const allDepsDone = deps.every(d => assigned.has(d))

        if (allDepsDone) {
          currentLevel.push(taskId)
        }
      }

      if (currentLevel.length === 0) {
        break // 防止死循环
      }

      levels.push(currentLevel)
      currentLevel.forEach(id => {
        remaining.delete(id)
        assigned.add(id)
      })
    }

    return levels
  }

  /**
   * 检查是否全部完成
   */
  private async checkAllComplete(): Promise<boolean> {
    const tasks = await taskService.getSessionTasks(this.sessionId)

    if (tasks.length === 0) return true

    return tasks.every(t =>
      t.status === 'COMPLETED' ||
      t.status === 'FAILED' ||
      t.status === 'CANCELLED'
    )
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task execution timeout (${timeoutMs}ms)`))
      }, timeoutMs)

      fn()
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * 等待
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ==================== 公开接口 ====================

  /**
   * 停止调度器
   */
  stop(): void {
    this.running = false
    console.log('[DAGScheduler] Stopped')
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<void> {
    await taskService.updateTaskStatus(taskId, 'PENDING')
    this.emit({
      type: 'task_wait',
      taskId,
      message: 'Task paused'
    })
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<void> {
    await taskService.updateTaskStatus(taskId, 'PENDING')
    this.emit({
      type: 'task_start',
      taskId,
      message: 'Task resumed'
    })
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    await taskService.cancelTask(taskId)
    this.emit({
      type: 'task_fail',
      taskId,
      message: 'Task cancelled'
    })
  }

  /**
   * 打回任务
   */
  async rejectTask(taskId: string, targetTaskId: string, reason: string): Promise<boolean> {
    const success = await taskService.rejectTask(taskId, targetTaskId, reason)

    if (success) {
      this.emit({
        type: 'task_wait',
        taskId: targetTaskId,
        message: `Task rejected: ${reason}`
      })

      // 重新触发执行循环
      this.execute()
    }

    return success
  }

  /**
   * 获取任务结果
   */
  getTaskResult(taskId: string): any {
    return this.taskResults.get(taskId)
  }

  /**
   * 获取 DAG 状态
   */
  async getDAGStatus(): Promise<{
    nodes: Array<{
      id: string
      name: string
      status: string
      executionMode: string
    }>
    edges: Array<{
      from: string
      to: string
    }>
    executable: string[]
  }> {
    const tasks = await taskService.getSessionTasks(this.sessionId)

    const nodes = tasks.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      executionMode: t.executionMode
    }))

    const edges: Array<{ from: string; to: string }> = []
    for (const t of tasks) {
      for (const depId of t.dependencies) {
        edges.push({ from: depId, to: t.id })
      }
    }

    const executable = (await taskService.getExecutableTasks(this.sessionId)).map(t => t.id)

    return { nodes, edges, executable }
  }
}

export function createDAGScheduler(sessionId: string, options?: DAGSchedulerOptions): DAGScheduler {
  return new DAGScheduler(sessionId, options)
}