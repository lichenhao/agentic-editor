/**
 * Task Service - 任务管理服务
 * 支持 DAG 任务依赖管理、状态更新
 */

import { prisma } from '../infrastructure/database/prisma'

export interface CreateTaskParams {
  sessionId: string
  name: string
  description?: string
  payload?: any
  executionMode?: 'SERIAL' | 'PARALLEL' | 'HYBRID'
  dependsOn?: string[]
  acceptanceCriteria?: any
}

export interface TaskWithDependencies {
  id: string
  name: string
  description: string | null
  payload: any
  executionMode: string
  status: string
  dependencies: string[]
  result: any
  error: string | null
}

class TaskService {

  /**
   * 创建任务（带依赖关系）
   */
  async createTask(params: CreateTaskParams): Promise<any> {
    const { sessionId, name, description, payload, executionMode = 'SERIAL', dependsOn = [], acceptanceCriteria } = params

    const task = await prisma.task.create({
      data: {
        sessionId,
        name,
        description,
        payload,
        executionMode,
        status: 'PENDING',
        acceptanceCriteria
      }
    })

    // 创建依赖关系
    if (dependsOn.length > 0) {
      for (const dependsOnId of dependsOn) {
        await prisma.taskDependency.create({
          data: {
            taskId: task.id,
            dependsOnId
          }
        })
      }
    }

    return task
  }

  /**
   * 批量创建任务（带依赖关系）
   */
  async createTasksWithDependencies(sessionId: string, taskPlans: Array<{
    name: string
    description?: string
    payload?: any
    dependsOn?: string[]
    executionMode?: 'SERIAL' | 'PARALLEL' | 'HYBRID'
  }>): Promise<any[]> {
    const tasks: any[] = []
    const nameToId = new Map<string, string>()

    // 第一遍：创建所有任务
    for (const plan of taskPlans) {
      const task = await this.createTask({
        sessionId,
        name: plan.name,
        description: plan.description,
        payload: plan.payload,
        executionMode: plan.executionMode || 'SERIAL',
        dependsOn: [] // 暂时不设置依赖，等所有任务创建后再设置
      })
      tasks.push(task)
      nameToId.set(plan.name, task.id)
    }

    // 第二遍：设置依赖关系
    for (const plan of taskPlans) {
      if (plan.dependsOn && plan.dependsOn.length > 0) {
        const taskId = nameToId.get(plan.name)!
        for (const depName of plan.dependsOn) {
          const dependsOnId = nameToId.get(depName)
          if (dependsOnId) {
            await prisma.taskDependency.create({
              data: {
                taskId,
                dependsOnId
              }
            })
          }
        }
      }
    }

    return tasks
  }

  /**
   * 获取会话的所有任务
   */
  async getSessionTasks(sessionId: string): Promise<TaskWithDependencies[]> {
    const tasks = await prisma.task.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    })

    // 获取每个任务的依赖
    const tasksWithDeps = await Promise.all(
      tasks.map(async (task) => {
        const deps = await prisma.taskDependency.findMany({
          where: { taskId: task.id },
          select: { dependsOnId: true }
        })
        return {
          ...task,
          dependencies: deps.map(d => d.dependsOnId)
        }
      })
    )

    return tasksWithDeps
  }

  /**
   * 获取可执行任务（所有依赖都已完成）
   */
  async getExecutableTasks(sessionId: string): Promise<any[]> {
    const tasks = await this.getSessionTasks(sessionId)

    // 获取已完成和正在运行的任务
    const completedOrRunningIds = new Set(
      tasks
        .filter(t => t.status === 'COMPLETED' || t.status === 'RUNNING')
        .map(t => t.id)
    )

    // 找出所有依赖都已完成的任务
    return tasks.filter(task => {
      if (task.status !== 'PENDING') return false

      const allDepsCompleted = task.dependencies.every(depId => completedOrRunningIds.has(depId))
      return allDepsCompleted
    })
  }

  /**
   * 获取任务（带依赖信息）
   */
  async getTaskWithDependencies(taskId: string): Promise<TaskWithDependencies | null> {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    })

    if (!task) return null

    const deps = await prisma.taskDependency.findMany({
      where: { taskId },
      select: { dependsOnId: true }
    })

    return {
      ...task,
      dependencies: deps.map(d => d.dependsOnId)
    }
  }

  /**
   * 验证 DAG 无环
   */
  async validateNoCycle(sessionId: string): Promise<boolean> {
    const tasks = await this.getSessionTasks(sessionId)

    // 构建邻接表
    const graph = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    for (const task of tasks) {
      graph.set(task.id, [])
      inDegree.set(task.id, 0)
    }

    for (const task of tasks) {
      for (const depId of task.dependencies) {
        const deps = graph.get(depId) || []
        deps.push(task.id)
        graph.set(depId, deps)
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1)
      }
    }

    // Kahn 算法检测环
    const queue: string[] = []
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) queue.push(taskId)
    }

    let count = 0
    while (queue.length > 0) {
      const taskId = queue.shift()!
      count++

      const neighbors = graph.get(taskId) || []
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }

    return count === tasks.length
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: string): Promise<any> {
    return prisma.task.update({
      where: { id: taskId },
      data: { status }
    })
  }

  /**
   * 启动任务
   */
  async startTask(taskId: string): Promise<any> {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'RUNNING',
        startedAt: new Date()
      }
    })
  }

  /**
   * 完成任务
   */
  async completeTask(taskId: string, result: any): Promise<any> {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        result,
        completedAt: new Date()
      }
    })
  }

  /**
   * 失败任务
   */
  async failTask(taskId: string, error: string): Promise<any> {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        error,
        completedAt: new Date()
      }
    })
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<any> {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date()
      }
    })
  }

  /**
   * 打回任务（重做）
   */
  async rejectTask(taskId: string, targetTaskId: string, reason: string): Promise<boolean> {
    try {
      // 将目标任务重置为 PENDING
      await prisma.task.update({
        where: { id: targetTaskId },
        data: {
          status: 'PENDING',
          result: undefined,
          error: undefined,
          completedAt: undefined
        }
      })
      return true
    } catch (error) {
      console.error('[TaskService] Error rejecting task:', error)
      return false
    }
  }
}

export const taskService = new TaskService()