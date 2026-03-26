import { Task, SubTask, TaskStatus } from '../domain/entities/index.js';
import { query, getRedis, execute } from '../db/index.js';
import { agentRepository } from '../db/repositories/AgentRepository.js';
import { SupervisorAgent } from '../agents/SupervisorAgent.js';
import { SpecialistAgent } from '../agents/SpecialistAgent.js';
import { contextManager } from '../context/ContextManager.js';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';

export interface TaskRunnerEvents {
  'task:start': (taskId: string) => void;
  'task:progress': (taskId: string, progress: number) => void;
  'task:complete': (taskId: string, output: string) => void;
  'task:error': (taskId: string, error: string) => void;
  'subtask:start': (taskId: string, subtaskId: string) => void;
  'subtask:complete': (taskId: string, subtaskId: string, output: string) => void;
}

export class TaskRunner extends EventEmitter {
  private redis = getRedis();

  async createTask(tenantId: string, userId: string, input: string, threadId?: string): Promise<Task> {
    const id = uuidv4();
    const now = new Date();

    // Find or create supervisor agent
    const supervisors = await agentRepository.findByRole('supervisor', tenantId);
    const supervisor = supervisors[0];

    await query(
      `INSERT INTO tasks (id, tenant_id, user_id, supervisor_id, status, input, thread_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, tenantId, userId, supervisor?.id || null, 'pending', input, threadId || null, now]
    );

    return {
      id,
      tenantId,
      userId,
      supervisorId: supervisor?.id,
      status: 'pending',
      input,
      threadId,
      decomposedSubtasks: [],
      contextTree: {},
      createdAt: now,
    };
  }

  async runTask(taskId: string): Promise<Task> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Update status to running
    await this.updateTaskStatus(taskId, 'running');
    this.emit('task:start', taskId);

    try {
      // Get supervisor agent
      if (!task.supervisorId) {
        throw new Error('No supervisor assigned to task');
      }

      const agent = await agentRepository.findById(task.supervisorId);
      if (!agent) {
        throw new Error(`Supervisor agent ${task.supervisorId} not found`);
      }

      // Load context
      const context = task.threadId
        ? await contextManager.load(task.threadId)
        : [];

      // Create appropriate agent instance
      const agentInstance = agent.role === 'supervisor'
        ? new SupervisorAgent(agent, task.tenantId)
        : new SpecialistAgent(agent, task.tenantId);

      // Execute task
      const result = await agentInstance.execute(task.input, {
        threadId: task.threadId || taskId,
        messages: context,
        metadata: { taskId },
      });

      // Save output
      await this.updateTaskOutput(taskId, result.output);

      // Save context
      if (task.threadId) {
        const newContext = [
          ...context,
          { role: 'user' as const, content: task.input, timestamp: new Date().toISOString() },
          { role: 'assistant' as const, content: result.output, timestamp: new Date().toISOString() },
        ];
        await contextManager.save(task.threadId, newContext);
      }

      // Update status to completed
      await this.updateTaskStatus(taskId, 'completed');
      this.emit('task:complete', taskId, result.output);

      return {
        ...task,
        status: 'completed',
        output: result.output,
        completedAt: new Date(),
      };
    } catch (error) {
      await this.updateTaskStatus(taskId, 'failed');
      this.emit('task:error', taskId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    const row = await query<any>(
      'SELECT * FROM tasks WHERE id = $1',
      [taskId]
    );

    return row[0] ? this.mapToTask(row[0]) : null;
  }

  async getTasksByTenant(tenantId: string, limit = 20, offset = 0): Promise<Task[]> {
    const rows = await query<any>(
      'SELECT * FROM tasks WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [tenantId, limit, offset]
    );

    return rows.map(row => this.mapToTask(row));
  }

  async getTaskProgress(taskId: string): Promise<{ total: number; completed: number; failed: number }> {
    const subtasks = await query<any>(
      'SELECT status FROM task_subtasks WHERE task_id = $1',
      [taskId]
    );

    return {
      total: subtasks.length,
      completed: subtasks.filter((s: any) => s.status === 'completed').length,
      failed: subtasks.filter((s: any) => s.status === 'failed').length,
    };
  }

  private async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const completedAt = status === 'completed' || status === 'failed' ? new Date() : null;

    await execute(
      `UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3`,
      [status, completedAt, taskId]
    );

    // Update Redis cache
    const cacheKey = `task:${taskId}:state`;
    if (status === 'completed' || status === 'failed') {
      await this.redis.del(cacheKey);
    } else {
      await this.redis.hset(cacheKey, { status, updated: Date.now() });
      await this.redis.expire(cacheKey, 3600);
    }
  }

  private async updateTaskOutput(taskId: string, output: string): Promise<void> {
    await execute(
      'UPDATE tasks SET output = $1 WHERE id = $2',
      [output, taskId]
    );
  }

  private mapToTask(row: any): Task {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      parentTaskId: row.parent_task_id,
      supervisorId: row.supervisor_id,
      status: row.status,
      input: row.input,
      output: row.output,
      decomposedSubtasks: typeof row.decomposed_subtasks === 'string'
        ? JSON.parse(row.decomposed_subtasks)
        : row.decomposed_subtasks || [],
      threadId: row.thread_id,
      contextTree: typeof row.context_tree === 'string'
        ? JSON.parse(row.context_tree)
        : row.context_tree || {},
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}

export const taskRunner = new TaskRunner();