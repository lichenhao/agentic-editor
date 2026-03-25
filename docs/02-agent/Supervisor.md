# Supervisor Agent 详细设计

## 1. 概述

Supervisor Agent 是系统的核心协调者，负责：
1. 需求解析与澄清
2. 任务拆解
3. 子 Agent 动态创建
4. 任务调度与执行
5. 结果聚合

## 2. 状态机定义

```typescript
interface SupervisorState {
  // 输入
  input: string;
  threadId: string;

  // 中间状态
  clarifiedInput?: string;
  decomposedTasks?: SubTask[];
  createdAgents?: CreatedAgent[];
  results: TaskResult[];
  currentTaskIndex: number;

  // 输出
  finalOutput?: string;
  contextSnapshot?: ContextSnapshot;
}

interface SubTask {
  id: string;
  name: string;
  description: string;
  agentRole?: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: string;
  output?: string;
}

interface CreatedAgent {
  id: string;
  role: string;
  thread: any; // LangGraph thread
}
```

## 3. LangGraph 节点实现

### 3.1 需求澄清节点 (clarify)

```typescript
async function clarifyRequirementsNode(state: SupervisorState) {
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });

  // 检查需求是否清晰
  const analysis = await llm.invoke(`
    <role>你是一个需求分析师</role>
    <task>分析以下用户需求是否足够清晰可执行</task>
    <input>${state.input}</input>

    分析并返回 JSON：
    {
      "isClear": true/false,
      "clarification": "如果不清晰，需要澄清的问题",
      "original": "如果清晰，返回原需求"
    }
  `);

  const result = JSON.parse(analysis.content);

  if (result.isClear) {
    return { clarifiedInput: result.original };
  } else {
    // 返回澄清问题（流程暂停，等待用户回答）
    return {
      clarifiedInput: null,
      needsClarification: true,
      clarificationQuestions: result.clarification
    };
  }
}
```

### 3.2 任务拆解节点 (decompose)

```typescript
async function decomposeTaskNode(state: SupervisorState) {
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });

  // 加载上下文
  const context = await contextManager.load(state.threadId);

  const response = await llm.invoke(`
    <role>你是一个任务规划专家</role>
    <task>将以下需求拆解为可执行的子任务</task>
    <context>${JSON.stringify(context)}</context>
    <input>${state.clarifiedInput}</input>

    拆解要求：
    1. 每个子任务应该是原子性的
    2. 明确任务间的依赖关系
    3. 为每个任务指定合适的 Agent 角色

    返回 JSON：
    {
      "tasks": [
        {
          "name": "任务名称",
          "description": "详细描述",
          "agentRole": "specialist/coder/reviewer",
          "dependencies": ["taskId1", "taskId2"]
        }
      ]
    }
  `);

  const { tasks } = JSON.parse(response.content);

  // 为每个任务生成 ID
  const subtasks = tasks.map((t: any, i: number) => ({
    id: `subtask-${i + 1}`,
    ...t,
    status: 'pending' as const
  }));

  return { decomposedTasks: subtasks };
}
```

### 3.3 创建子 Agent 节点 (create_agents)

```typescript
async function createSubAgentsNode(state: SupervisorState) {
  const createdAgents: CreatedAgent[] = [];

  for (const task of state.decomposedTasks || []) {
    // 根据任务角色创建或复用 Agent
    let agent = await this.agentPool.get(task.agentRole);

    if (!agent) {
      // 动态创建 Agent
      const template = await this.templateRepo.findByRole(task.agentRole);
      agent = await this.agentFactory.createFromTemplate(template.id, {
        threadId: state.threadId
      });
    }

    createdAgents.push({
      id: agent.id,
      role: task.agentRole,
      thread: agent.thread
    });
  }

  return { createdAgents };
}
```

### 3.4 任务调度节点 (orchestrate)

```typescript
async function orchestrateNode(state: SupervisorState) {
  const results: TaskResult[] = [];

  // 构建依赖图
  const taskGraph = this.buildDependencyGraph(state.decomposedTasks || []);

  // 按依赖顺序执行
  const executed = new Set<string>();

  while (executed.size < state.decomposedTasks?.length) {
    // 找到所有依赖已满足的任务
    const readyTasks = taskGraph
      .filter(t => !executed.has(t.id))
      .filter(t => t.dependencies.every(d => executed.has(d)));

    if (readyTasks.length === 0) break;

    // 并行执行独立任务
    const batchResults = await Promise.all(
      readyTasks.map(async (task) => {
        const agent = state.createdAgents?.find(a => a.id === task.agentRole);
        return await this.executeTask(agent, task);
      })
    );

    results.push(...batchResults);
    readyTasks.forEach(t => executed.add(t.id));
  }

  return { results };
}

async function executeTask(agent: CreatedAgent, task: SubTask): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    const output = await agent.thread.invoke({ input: task.input || task.description });

    return {
      taskId: task.id,
      success: true,
      output: output.finalOutput,
      duration: Date.now() - startTime,
      tokenUsed: output.tokenUsed
    };
  } catch (error) {
    return {
      taskId: task.id,
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}
```

### 3.5 结果聚合节点 (aggregate)

```typescript
async function aggregateResultsNode(state: SupervisorState) {
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });

  // 汇总所有子任务结果
  const summary = state.results.map(r => ({
    taskId: r.taskId,
    success: r.success,
    output: r.output,
    error: r.error
  }));

  // 使用 LLM 生成最终输出
  const finalOutput = await llm.invoke(`
    <role>你是一个结果总结专家</role>
    <task>根据以下子任务结果，生成最终输出</task>
    <original_request>${state.input}</original_request>
    <subtask_results>${JSON.stringify(summary)}</subtask_results>
  `);

  return { finalOutput: finalOutput.content };
}
```

### 3.6 上下文优化节点 (context_optimize)

```typescript
async function optimizeContextNode(state: SupervisorState) {
  // 保存当前上下文
  const contextSnapshot = await contextManager.snapshot(state.threadId);

  // 检查是否需要优化
  const tokenCount = contextManager.countTokens(contextSnapshot);

  if (tokenCount > MAX_CONTEXT_TOKENS * 0.8) {
    // 执行优化：剪枝、压缩、摘要
    const optimized = await contextManager.optimize(contextSnapshot);
    await contextManager.save(state.threadId, optimized);
  }

  return { contextSnapshot };
}
```

## 4. 错误处理

### 4.1 重试策略

```typescript
const supervisorGraph = new StateGraph<SupervisorState>()
  // ... 节点定义
  .addNode('handle_error', handleErrorNode)
  .addConditionalEdges('orchestrate', (state) => {
    const hasFailures = state.results.some(r => !r.success);
    if (hasFailures && state.retryCount < MAX_RETRIES) {
      return 'handle_error';
    }
    return 'aggregate';
  })
  .addEdge('handle_error', 'orchestrate')
  .compile();
```

### 4.2 错误恢复

```typescript
async function handleErrorNode(state: SupervisorState) {
  const failedTasks = state.results.filter(r => !r.success);

  // 对失败任务进行重试
  for (const failed of failedTasks) {
    const retryResult = await this.retryTask(failed);
    // 更新结果
  }

  return { retryCount: (state.retryCount || 0) + 1 };
}
```

## 5. 监控与指标

```typescript
interface SupervisorMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgDuration: number;
  totalTokens: number;
  clarificationCount: number;
}

// 采集指标
await metricsRepo.record({
  type: 'supervisor',
  taskId: state.threadId,
  ...metrics
});
```

## 6. 相关文档

- [Agent 核心设计](./README.md)
- [Skill 详细设计](./Skill.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)