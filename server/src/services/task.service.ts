import { prisma } from '../infrastructure/database/prisma'
import { TaskStatus } from '@prisma/client'

export interface CreateTaskParams {
  projectId: string
  sessionId?: string
  type: string
  name?: string
  payload?: any
  acceptanceCriteria?: any
  parentTaskId?: string
  rootTaskId?: string
  assigneeType?: string
  dependsOn?: string[]
}

export interface TaskUpdateParams {
  status?: TaskStatus
  result?: any
  outputs?: any
  artifacts?: any
  feedback?: string
  error?: string
  startedAt?: Date
  completedAt?: Date
}

const MAX_RETRIES = 1 // 可配置的最大重试次数

export class TaskService {
  /**
   * 创建新任务
   */
  async createTask(params: CreateTaskParams) {
    const { projectId, sessionId, type, name, payload, acceptanceCriteria, parentTaskId, rootTaskId, assigneeType, dependsOn } = params

    // 确定 rootTaskId（如果没有则使用自己的ID）
    const finalRootTaskId = rootTaskId || (await this.generateId())

    const task = await prisma.task.create({
      data: {
        projectId,
        sessionId,
        type,
        name,
        payload: payload || {},
        acceptanceCriteria,
        parentTaskId,
        rootTaskId: finalRootTaskId,
        assigneeType,
        dependsOn: dependsOn || [],
        status: TaskStatus.PENDING
      }
    })

    return task
  }

  /**
   * 创建根任务（工作流起点）
   */
  async createRootTask(projectId: string, sessionId: string, type: string, name: string, payload?: any) {
    const rootTaskId = await this.generateId()

    const task = await prisma.task.create({
      data: {
        projectId,
        sessionId,
        type,
        name,
        payload: payload || {},
        rootTaskId, // 自己就是根任务
        status: TaskStatus.PENDING
      }
    })

    return task
  }

  /**
   * 创建子任务
   */
  async createSubTask(parentTaskId: string, type: string, name: string, payload?: any, assigneeType?: string) {
    const parentTask = await prisma.task.findUnique({ where: { id: parentTaskId } })
    if (!parentTask) throw new Error('Parent task not found')

    const task = await prisma.task.create({
      data: {
        projectId: parentTask.projectId,
        sessionId: parentTask.sessionId || undefined,
        type,
        name,
        payload: payload || {},
        parentTaskId,
        rootTaskId: parentTask.rootTaskId || parentTaskId,
        assigneeType,
        status: TaskStatus.PENDING
      }
    })

    return task
  }

  /**
   * 开始执行任务
   */
  async startTask(taskId: string) {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.IN_PROGRESS,
        startedAt: new Date()
      }
    })

    return task
  }

  /**
   * 完成任务
   */
  async completeTask(taskId: string, result?: any, outputs?: any, artifacts?: any) {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        result,
        outputs,
        artifacts,
        completedAt: new Date()
      }
    })

    return task
  }

  /**
   * 任务失败处理
   */
  async failTask(taskId: string, error: string): Promise<{ task: any; needsUserConfirmation: boolean }> {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('Task not found')

    // 检查是否可以重试
    if (task.retries < MAX_RETRIES) {
      // 重试
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.PENDING,
          retries: task.retries + 1,
          error
        }
      })
      return { task: null, needsUserConfirmation: false }
    } else {
      // 超过重试次数，需要用户确认
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          error
        }
      })
      return { task, needsUserConfirmation: true }
    }
  }

  /**
   * 处理任务失败（返回是否可以重试）
   */
  async handleFailure(taskId: string, error: string): Promise<boolean> {
    const result = await this.failTask(taskId, error)
    return !result.needsUserConfirmation  // 如果不需要用户确认，说明可以重试
  }

  /**
   * 标记任务需要用户确认
   */
  async requestApproval(taskId: string, description?: string) {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.WAITING_APPROVAL,
        result: { description }
      }
    })

    return task
  }

  /**
   * 用户确认后继续执行
   */
  async approveTask(taskId: string, feedback?: string) {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.APPROVED,
        feedback
      }
    })

    return task
  }

  /**
   * 任务需要修改
   */
  async markNeedsRevision(taskId: string, feedback: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('Task not found')

    // 检查重试次数
    if (task.retries >= MAX_RETRIES) {
      // 超过重试次数，返回用户
      return this.requestApproval(taskId, `修改${MAX_RETRIES}次后仍不满意: ${feedback}`)
    }

    // 重试
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.PENDING,
        retries: task.retries + 1,
        feedback
      }
    })

    return updated
  }

  /**
   * 获取项目的所有任务（按根任务分组）
   */
  async getProjectTasks(projectId: string) {
    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    })

    // 构建任务树
    const taskMap = new Map<string, any>()
    tasks.forEach(task => taskMap.set(task.id, { ...task, children: [] }))

    const rootTasks: any[] = []
    tasks.forEach(task => {
      const taskWithChildren = taskMap.get(task.id)
      if (task.parentTaskId) {
        const parent = taskMap.get(task.parentTaskId)
        if (parent) {
          parent.children.push(taskWithChildren)
        }
      } else {
        rootTasks.push(taskWithChildren)
      }
    })

    return rootTasks
  }

  /**
   * 获取当前进行中的任务
   */
  async getActiveTasks(projectId: string) {
    return prisma.task.findMany({
      where: {
        projectId,
        status: {
          in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.WAITING_APPROVAL]
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  }

  /**
   * 检查任务依赖是否满足
   */
  async checkDependencies(taskId: string): Promise<boolean> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { parentTask: true }
    })

    if (!task || !task.dependsOn || task.dependsOn.length === 0) {
      return true // 没有依赖
    }

    // 检查所有依赖任务是否完成
    const dependentTasks = await prisma.task.findMany({
      where: { id: { in: task.dependsOn } }
    })

    return dependentTasks.every(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.APPROVED)
  }

  /**
   * 生成唯一ID
   */
  private async generateId(): Promise<string> {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const taskService = new TaskService()