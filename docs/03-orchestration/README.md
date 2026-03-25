# 编排层设计

## 1. 概述

编排层负责协调 Agent 与策略引擎、审批处理、任务调度，是系统的核心业务流程层。

## 2. 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                      编排层 (Orchestration)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ AgentOrchestrator│  │  TaskScheduler   │  │ResultAggregator│ │
│  │   (核心编排器)    │  │   (任务调度)     │  │  (结果聚合)   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  PolicyEngine    │  │ ApprovalHandler  │                    │
│  │   (策略引擎)      │  │   (审批处理)     │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Agent Orchestrator

### 3.1 职责

- 协调 Supervisor Agent 和子 Agent 的执行
- 管理任务生命周期
- 处理异常和重试

### 3.2 接口

```typescript
interface AgentOrchestrator {
  // 启动任务
  startTask(input: TaskInput): Promise<TaskHandle>;

  // 获取任务状态
  getTaskStatus(taskId: string): Promise<TaskStatus>;

  // 取消任务
  cancelTask(taskId: string): Promise<void>;

  // 暂停/恢复
  pauseTask(taskId: string): Promise<void>;
  resumeTask(taskId: string): Promise<void>;
}

interface TaskHandle {
  taskId: string;
  threadId: string;
  status: TaskStatus;
  events: EventEmitter;
}

interface TaskStatus {
  state: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;          // 0-1
  currentStep?: string;
  subtasks: SubtaskStatus[];
}
```

### 3.3 实现

```typescript
class AgentOrchestratorImpl implements AgentOrchestrator {
  async startTask(input: TaskInput): Promise<TaskHandle> {
    const taskId = generateId();
    const threadId = generateId();

    // 创建任务记录
    await this.taskRepo.create({
      id: taskId,
      tenantId: input.tenantId,
      userId: input.userId,
      input: input.content,
      status: 'pending'
    });

    // 初始化 Supervisor
    const supervisor = await this.supervisorFactory.create(input.tenantId);

    // 启动执行
    this.executor.execute(taskId, supervisor, { input: input.content, threadId });

    return {
      taskId,
      threadId,
      status: 'pending',
      events: new EventEmitter()
    };
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const task = await this.taskRepo.findById(taskId);

    // 从 Redis 获取实时进度
    const progress = await this.redis.get(`task:${taskId}:progress`);

    return {
      state: task.status,
      progress: progress ? JSON.parse(progress).progress : 0,
      subtasks: task.subtasks
    };
  }
}
```

## 4. Task Scheduler

### 4.1 调度策略

```typescript
interface TaskScheduler {
  schedule(task: Task): Promise<ScheduledTask>;
  reschedule(taskId: string, newTime: Date): Promise<void>;
  cancel(taskId: string): Promise<void>;
}

enum SchedulingStrategy {
  FIFO = 'fifo',           // 先进先出
  PRIORITY = 'priority',  // 优先级优先
  FAIR = 'fair'           // 公平调度
}
```

### 4.2 实现

```typescript
class TaskSchedulerImpl implements TaskScheduler {
  private queue: PriorityQueue<ScheduledTask>;

  async schedule(task: Task): Promise<ScheduledTask> {
    const priority = await this.calculatePriority(task);

    const scheduled: ScheduledTask = {
      taskId: task.id,
      scheduledAt: new Date(),
      priority,
      strategy: SchedulingStrategy.FAIR
    };

    this.queue.enqueue(scheduled);
    return scheduled;
  }

  private async calculatePriority(task: Task): Promise<number> {
    // 基于用户等级、任务紧急程度计算优先级
    const user = await this.userRepo.findById(task.userId);
    return user.priority + task.urgency;
  }
}
```

## 5. Result Aggregator

### 5.1 职责

- 汇总多个子 Agent 的执行结果
- 处理结果冲突
- 生成最终输出

### 5.2 实现

```typescript
class ResultAggregator {
  async aggregate(results: TaskResult[], strategy: AggregationStrategy): Promise<AggregatedResult> {
    switch (strategy) {
      case 'merge':
        return this.merge(results);
      case 'vote':
        return this.vote(results);
      case 'llm_summary':
        return await this.llmSummary(results);
      default:
        return this.merge(results);
    }
  }

  private async llmSummary(results: TaskResult[]): Promise<AggregatedResult> {
    const llm = new Anthropic({ model: 'claude-sonnet-4-6' });

    const response = await llm.invoke(`
      汇总以下结果：
      ${results.map(r => r.output).join('\n---\n')}
    `);

    return {
      output: response.content,
      sources: results.map(r => r.taskId)
    };
  }
}
```

## 6. 相关文档

- [策略引擎设计](./Policy.md)
- [审批处理设计](./Approval.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)
- Agent 核心：[../02-agent/README.md](../02-agent/README.md)