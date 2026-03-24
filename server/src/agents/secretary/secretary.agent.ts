/**
 * Secretary Agent - 通用智能助理（秘书角色）
 * 负责需求分析、任务分配、监督执行、验收汇报
 * 具备 CoA（Chain of Actions）工作模式
 */

import { prisma } from '../../infrastructure/database/prisma'
import { AgentRole, ExecutionMode } from '@prisma/client'
import { sessionService } from '../../services/session.service'
import { contextService } from '../../services/context.service'
import { taskService } from '../../services/task.service'
import { domainKnowledgeService } from '../../services/domain-knowledge.service'
import { attachmentService } from '../../services/attachment.service'
import { performanceService } from '../../services/performance.service'
import { projectService } from '../../services/project.service'
import { createDAGScheduler, type DAGScheduler, type SchedulerEvent } from '../scheduler/dag.scheduler'
import { inputClassifier, type InputClassification, type UserInputType } from '../classifier/input-classifier'
import { callClaude, isClaudeConfigured } from '../../infrastructure/ai/claude'

// Secretary 系统提示词
const SECRETARY_SYSTEM_PROMPT = `你是一个专业的通用智能助理（Secretary/秘书）。

你的核心职责：
1. **需求分析**：理解用户需求，识别任务类型和复杂度
2. **任务规划**：将复杂需求拆解为可执行的任务清单
3. **任务分配**：根据任务类型选择合适的执行 Agent
4. **监督执行**：监控任务执行进度，处理异常情况
5. **验收汇报**：汇总任务产出，生成验收报告

工作模式（Chain of Actions）：
1. 接收用户需求
2. 分析需求复杂度（简单/一般/复杂）
3. 简单任务 → 直接执行或分配给 Tool Agent
4. 复杂任务 → 拆解为子任务，构建 DAG 工作流
5. 遇到新领域 → 触发领域知识搜集和 Agent 注册
6. 执行过程中需要用户确认 → 暂停等待
7. 任务完成后 → 汇总产出，生成报告

关键能力：
- 识别用户意图和任务类型
- 构建 DAG 任务依赖图
- 处理任务打回和重做
- 管理用户介入流程（确认、反馈、终止）
- 生成结构化的验收报告

可用工具：
- analyze_request: 分析用户需求
- plan_tasks: 规划任务列表
- assign_tasks: 分配任务给 Agent
- monitor_progress: 监控执行进度
- generate_report: 生成验收报告
- handle_user_feedback: 处理用户反馈
- collect_domain_knowledge: 搜集领域知识

注意：
- 你不擅长具体执行工作，但非常擅长找到合适的工作人员
- 遇到不确定的领域时，主动进行知识搜集
- 保持与用户的沟通，及时反馈进度
- 确保所有产出物可追溯、可验收`

export interface SecretaryContext {
  sessionId: string
  userId: string
  userMessage: string
  attachmentIds?: string[]
  sendEvent?: (event: any) => void
}

export interface SecretaryResult {
  success: boolean
  message: string
  tasks?: any[]
  report?: any
  requiresUserApproval?: boolean
  approvalTaskId?: string
}

export class SecretaryAgent {
  private scheduler: DAGScheduler | null = null

  /**
   * 执行 Secretary 逻辑
   */
  async execute(context: SecretaryContext): Promise<SecretaryResult> {
    const { sessionId, userId, userMessage, attachmentIds, sendEvent } = context

    console.log(`[Secretary] Processing session: ${sessionId}`)
    console.log(`[Secretary] User message: ${userMessage.substring(0, 100)}...`)

    try {
      // 1. 更新 Secretary 状态为 RUNNING
      await sessionService.updateSecretaryStatus(sessionId, 'RUNNING')

      // 2. 记录用户消息到上下文
      await contextService.addContext({
        sessionId,
        role: 'user',
        content: userMessage,
        sourceAgent: 'user',
        metadata: attachmentIds ? { attachmentIds } : undefined
      })

      // 3. 分析用户需求
      sendEvent?.({ type: 'thinking', stage: 'analyzing', content: '分析用户需求...' })
      const analysis = await this.analyzeRequest(userMessage)

      // 4. 检查是否需要处理新领域
      let newAgentDefinition = null
      if (analysis.requiresNewDomain) {
        sendEvent?.({ type: 'thinking', stage: 'domain', content: '识别新领域，搜集知识...' })
        newAgentDefinition = await domainKnowledgeService.handleNewDomain(userMessage)

        if (newAgentDefinition) {
          sendEvent?.({
            type: 'domain_created',
            agentType: newAgentDefinition.type,
            message: `已创建新 Agent: ${newAgentDefinition.name}`
          })
        }
      }

      // 5. 规划任务
      sendEvent?.({ type: 'thinking', stage: 'planning', content: '规划任务...' })
      const taskPlan = await this.planTasks(analysis, attachmentIds)

      if (taskPlan.length === 0) {
        // 无需执行任务，直接回复
        const response = await this.generateSimpleResponse(analysis)
        await contextService.addContext({
          sessionId,
          role: 'assistant',
          content: response,
          sourceAgent: 'secretary'
        })

        await sessionService.updateSecretaryStatus(sessionId, 'IDLE')
        return { success: true, message: response }
      }

      // 6. 创建任务（带依赖关系）
      sendEvent?.({ type: 'thinking', stage: 'creating', content: '创建任务...' })
      await taskService.createTasksWithDependencies(sessionId, taskPlan)

      // 7. 构建并执行 DAG
      sendEvent?.({ type: 'thinking', stage: 'executing', content: '执行任务...' })
      this.scheduler = createDAGScheduler(sessionId, {
        maxParallel: 3,
        defaultTimeout: 300000
      })

      // 设置事件回调
      this.scheduler.setEventCallback((event: SchedulerEvent) => {
        this.handleSchedulerEvent(event, sendEvent)
      })

      // 设置任务执行器
      this.scheduler.setTaskExecutor(async (taskId, payload) => {
        return this.executeTask(taskId, payload, sendEvent)
      })

      // 执行 DAG
      await this.scheduler.execute()

      // 8. 生成验收报告
      sendEvent?.({ type: 'thinking', stage: 'reporting', content: '生成验收报告...' })
      const report = await this.generateReport(sessionId)

      // 9. 更新 Secretary 状态
      await sessionService.updateSecretaryStatus(sessionId, 'IDLE')

      // 10. 记录完成消息
      await contextService.addContext({
        sessionId,
        role: 'assistant',
        content: report.summary,
        sourceAgent: 'secretary',
        metadata: { type: 'report', tasks: taskPlan.length }
      })

      sendEvent?.({
        type: 'done',
        summary: report.summary,
        report
      })

      return {
        success: true,
        message: report.summary,
        tasks: taskPlan,
        report
      }

    } catch (error: any) {
      console.error('[Secretary] Error:', error)

      await sessionService.updateSecretaryStatus(sessionId, 'IDLE')

      await contextService.addContext({
        sessionId,
        role: 'assistant',
        content: `处理出错: ${error.message}`,
        sourceAgent: 'secretary',
        metadata: { type: 'error' }
      })

      sendEvent?.({ type: 'error', message: error.message })

      return {
        success: false,
        message: error.message
      }
    }
  }

  /**
   * 分析用户需求
   */
  private async analyzeRequest(userMessage: string): Promise<any> {
    // 简单分析（实际可用 NLP/LLM）
    const message = userMessage.toLowerCase()

    // 识别复杂度
    let complexity = 'simple'
    if (message.includes('并且') || message.includes('同时') || message.includes('还有')) {
      complexity = 'complex'
    } else if (message.length > 200 || message.includes('如何')) {
      complexity = 'medium'
    }

    // 识别任务类型
    let taskType = 'general'
    if (message.includes('视频') || message.includes('生成视频')) {
      taskType = 'video_generation'
    } else if (message.includes('图片') || message.includes('画')) {
      taskType = 'image_generation'
    } else if (message.includes('代码') || message.includes('编程')) {
      taskType = 'code_generation'
    } else if (message.includes('写') || message.includes('文案')) {
      taskType = 'writing'
    }

    // 检查是否需要新领域
    const requiresNewDomain = !['general', 'video_generation', 'image_generation', 'code_generation', 'writing'].includes(taskType)

    return {
      complexity,
      taskType,
      requiresNewDomain,
      rawMessage: userMessage
    }
  }

  /**
   * 规划任务列表
   */
  private async planTasks(analysis: any, attachmentIds?: string[]): Promise<Array<{
    name: string
    description?: string
    payload?: any
    dependsOn?: string[]
    executionMode?: ExecutionMode
  }>> {
    const tasks: Array<{
      name: string
      description?: string
      payload?: any
      dependsOn?: string[]
      executionMode?: ExecutionMode
    }> = []

    // 根据任务类型生成任务
    switch (analysis.taskType) {
      case 'video_generation':
        tasks.push(
          { name: 'analyze_requirement', description: '分析视频需求', executionMode: 'SERIAL' },
          { name: 'generate_script', description: '生成视频脚本', dependsOn: ['analyze_requirement'], executionMode: 'SERIAL' },
          { name: 'generate_assets', description: '生成视觉素材', dependsOn: ['generate_script'], executionMode: 'PARALLEL' },
          { name: 'compose_video', description: '合成视频', dependsOn: ['generate_assets'], executionMode: 'SERIAL' }
        )
        break

      case 'image_generation':
        tasks.push(
          { name: 'optimize_prompt', description: '优化生成提示词', executionMode: 'SERIAL' },
          { name: 'generate_image', description: '生成图片', dependsOn: ['optimize_prompt'], executionMode: 'SERIAL' }
        )
        break

      case 'code_generation':
        tasks.push(
          { name: 'analyze_requirement', description: '分析代码需求', executionMode: 'SERIAL' },
          { name: 'design_solution', description: '设计技术方案', dependsOn: ['analyze_requirement'], executionMode: 'SERIAL' },
          { name: 'write_code', description: '编写代码', dependsOn: ['design_solution'], executionMode: 'SERIAL' },
          { name: 'test_code', description: '测试代码', dependsOn: ['write_code'], executionMode: 'SERIAL' }
        )
        break

      case 'writing':
        tasks.push(
          { name: 'analyze_topic', description: '分析主题', executionMode: 'SERIAL' },
          { name: 'write_content', description: '撰写内容', dependsOn: ['analyze_topic'], executionMode: 'SERIAL' },
          { name: 'review_content', description: '审核内容', dependsOn: ['write_content'], executionMode: 'SERIAL' }
        )
        break

      default:
        // 通用任务
        if (analysis.complexity === 'complex') {
          tasks.push(
            { name: 'decompose_task', description: '拆解复杂任务', executionMode: 'SERIAL' },
            { name: 'execute_subtasks', description: '执行子任务', dependsOn: ['decompose_task'], executionMode: 'PARALLEL' },
            { name: 'compile_result', description: '汇总结果', dependsOn: ['execute_subtasks'], executionMode: 'SERIAL' }
          )
        } else {
          tasks.push(
            { name: 'execute_task', description: '执行任务', executionMode: 'SERIAL' }
          )
        }
    }

    // 添加附件处理任务
    if (attachmentIds && attachmentIds.length > 0) {
      tasks.unshift({
        name: 'process_attachments',
        description: '处理附件',
        payload: { attachmentIds },
        executionMode: 'SERIAL'
      })
    }

    return tasks
  }

  /**
   * 执行单个任务（调用对应的 Specialist Agent）
   */
  private async executeTask(taskId: string, payload: any, sendEvent?: (event: any) => void): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    console.log(`[Secretary] Executing task: ${task.name}`)

    // 获取会话上下文用于 LLM 生成
    const sessionContexts = await contextService.getContexts(task.sessionId, { limit: 5 })
    const userMessage = sessionContexts.find(c => c.role === 'user')?.content || ''

    // 根据任务名称分发到不同的处理逻辑
    switch (task.name) {
      case 'process_attachments':
        return this.processAttachments(payload.attachmentIds)

      case 'analyze_requirement':
      case 'analyze_topic':
        // 使用 LLM 分析主题
        if (isClaudeConfigured()) {
          try {
            const analysis = await callClaude(
              `请分析以下用户需求，提取关键主题和创作要点：\n\n${userMessage}`,
              '你是一个专业的创意写作分析师，擅长分析创作需求。'
            )
            return { status: 'analyzed', result: analysis }
          } catch (e) {
            console.error('[Secretary] LLM analysis failed:', e)
          }
        }
        return { status: 'analyzed', result: '需求分析完成' }

      case 'generate_script':
        return { script: '生成的视频脚本...' }

      case 'optimize_prompt':
        return { prompt: '优化的提示词...' }

      case 'generate_image':
        return { imageUrl: '生成的图片URL' }

      case 'write_content':
        // 使用 LLM 生成小说内容
        if (isClaudeConfigured()) {
          try {
            const novelContent = await callClaude(
              `请根据用户需求写一篇不低于3000字的短篇科幻小说：\n\n${userMessage}`,
              `你是一位获奖科幻小说作家，擅长创作引人入胜的科幻故事。
               你的作品特点：
               - 深刻探讨人性与科技的关系
               - 富有想象力的世界观设定
               - 生动的人物刻画
               - 引人深思的主题

               请创作一篇完整的短篇科幻小说，字数不少于3000字。`
            )
            return { content: novelContent, wordCount: novelContent.length }
          } catch (e) {
            console.error('[Secretary] LLM writing failed:', e)
          }
        }
        return { content: '撰写的内容...' }

      case 'execute_task':
      case 'decompose_task':
      default:
        return { status: 'completed', result: '任务执行完成' }
    }
  }

  /**
   * 处理附件
   */
  private async processAttachments(attachmentIds: string[]): Promise<any> {
    const results = []

    for (const attachmentId of attachmentIds) {
      const attachment = await attachmentService.getAttachment(attachmentId)
      results.push({
        attachmentId,
        fileName: attachment?.fileName,
        shardCount: attachment?.shards?.length || 0,
        status: 'processed'
      })
    }

    return { attachments: results }
  }

  /**
   * 生成简单响应（无需执行任务）
   */
  private async generateSimpleResponse(analysis: any): Promise<string> {
    const responses: Record<string, string> = {
      greeting: '你好！我是你的智能助理。有什么我可以帮助你的吗？',
      help: '我可以帮你完成各种任务，比如生成视频、图片、代码，撰写文案等。请告诉我你的需求。',
      general: '我明白了你的需求。让我帮你分析一下...'
    }

    const message = analysis.rawMessage.toLowerCase()

    if (message.includes('你好') || message.includes('hello') || message.includes('hi')) {
      return responses.greeting
    }

    if (message.includes('帮助') || message.includes('help')) {
      return responses.help
    }

    return responses.general
  }

  /**
   * 生成验收报告
   */
  private async generateReport(sessionId: string): Promise<any> {
    const tasks = await taskService.getSessionTasks(sessionId)

    const completed = tasks.filter(t => t.status === 'COMPLETED')
    const failed = tasks.filter(t => t.status === 'FAILED')
    const pending = tasks.filter(t => t.status === 'PENDING')

    const products = await prisma.workProduct.findMany({
      where: { sessionId }
    })

    // 获取生成的小说内容
    const writeContentTask = tasks.find(t => t.name === 'write_content')
    const novelContent = writeContentTask?.result?.content || ''

    // 如果有生成的内容，保存到 WorkProduct
    if (novelContent && products.length === 0 && writeContentTask) {
      await prisma.workProduct.create({
        data: {
          sessionId,
          taskId: writeContentTask.id,
          agentType: 'secretary',
          type: 'TEXT',
          name: '科幻小说',
          content: novelContent.substring(0, 10000), // 限制存储长度
          metadata: {
            wordCount: novelContent.length,
            taskResult: writeContentTask.result
          }
        }
      })
    }

    return {
      summary: `任务完成！共 ${tasks.length} 个任务，已完成 ${completed.length} 个` +
        (failed.length > 0 ? `，失败 ${failed.length} 个` : '') +
        (pending.length > 0 ? `，待处理 ${pending.length} 个` : '') +
        (novelContent ? `\n\n已生成科幻小说 ${novelContent.length} 字` : ''),
      totalTasks: tasks.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      pendingTasks: pending.length,
      products: products.length,
      novelWordCount: novelContent.length || 0,
      taskDetails: tasks.map(t => ({
        name: t.name,
        status: t.status,
        result: t.name === 'write_content' ? { wordCount: t.result?.wordCount } : t.result
      }))
    }
  }

  /**
   * 处理调度器事件
   */
  private handleSchedulerEvent(event: SchedulerEvent, sendEvent?: (event: any) => void): void {
    switch (event.type) {
      case 'task_start':
        sendEvent?.({
          type: 'task_status',
          taskId: event.taskId,
          status: 'RUNNING',
          message: event.message
        })
        break

      case 'task_complete':
        sendEvent?.({
          type: 'task_status',
          taskId: event.taskId,
          status: 'COMPLETED',
          message: event.message,
          result: event.data
        })
        break

      case 'task_fail':
        sendEvent?.({
          type: 'task_status',
          taskId: event.taskId,
          status: 'FAILED',
          message: event.message
        })
        break

      case 'task_wait':
        sendEvent?.({
          type: 'user_interaction',
          taskId: event.taskId,
          message: event.message
        })
        break

      case 'all_complete':
        sendEvent?.({
          type: 'all_complete',
          message: event.message
        })
        break

      case 'error':
        sendEvent?.({
          type: 'error',
          message: event.message
        })
        break
    }
  }

  // ==================== 用户交互处理 ====================

  /**
   * 处理用户确认
   */
  async handleConfirmation(sessionId: string, taskId: string, approved: boolean, feedback?: string): Promise<void> {
    if (approved) {
      // 确认通过，继续执行
      await taskService.updateTaskStatus(taskId, 'PENDING')

      if (this.scheduler) {
        await this.scheduler.resumeTask(taskId)
      }
    } else {
      // 反馈意见，打回重做
      if (feedback && this.scheduler) {
        // 找到直接上游任务并打回
        const task = await taskService.getTaskWithDependencies(taskId)
        if (task && task.dependencies.length > 0) {
          await this.scheduler.rejectTask(taskId, task.dependencies[0], feedback)
        }
      }
    }
  }

  /**
   * 处理用户终止
   */
  async handleCancellation(sessionId: string, taskId?: string): Promise<void> {
    if (taskId) {
      // 终止单个任务
      await taskService.cancelTask(taskId)
    } else {
      // 终止所有任务
      if (this.scheduler) {
        this.scheduler.stop()
      }

      const tasks = await taskService.getSessionTasks(sessionId)
      for (const task of tasks) {
        if (task.status === 'PENDING' || task.status === 'RUNNING') {
          await taskService.cancelTask(task.id)
        }
      }
    }

    await sessionService.updateSecretaryStatus(sessionId, 'IDLE')
  }

  /**
   * 获取 DAG 状态
   */
  async getDAGStatus(sessionId: string): Promise<any> {
    if (!this.scheduler) {
      this.scheduler = createDAGScheduler(sessionId)
    }
    return this.scheduler.getDAGStatus()
  }
}

export const secretaryAgent = new SecretaryAgent()