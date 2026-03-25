# Agent 核心设计

## 1. 概述

本文档定义 Agent 核心模块的设计，包括 Agent 生命周期、Supervisor Agent、Skill 引擎。

## 2. Agent 生命周期

```
创建 → 注册 → 运行 → 考核 → (迭代/重制/归档)
```

### 2.1 状态机

| 状态 | 说明 | 可转换状态 |
|------|------|-----------|
| `pending` | 待创建 | → active |
| `active` | 运行中 | → evaluating, inactive, recreating |
| `evaluating` | 考核中 | → active, recreating, archived |
| `inactive` | 已停用 | → active |
| `recreating` | 重制中 | → active |
| `archived` | 已归档 | - |

### 2.2 核心接口

```typescript
// AgentRepository - 遵循数据库优先原则
interface AgentRepository {
  findById(id: string): Promise<Agent | null>;
  findByRole(role: string, tenantId: string): Promise<Agent[]>;
  findActive(tenantId: string): Promise<Agent[]>;
  create(agent: Agent): Promise<void>;
  update(id: string, data: Partial<Agent>): Promise<void>;
  softDelete(id: string): Promise<void>;
}

// Agent 实体
interface Agent {
  id: string;
  tenantId: string;
  templateId: string;
  name: string;
  role: 'supervisor' | 'specialist' | 'spec-skill';
  systemPrompt: string;
  tools: string[];
  status: AgentStatus;
  version: number;
  parentAgentId?: string;
  metrics: AgentMetrics;
  createdAt: Date;
  updatedAt: Date;
}
```

## 3. Supervisor Agent

Supervisor Agent 负责需求拆解、子 Agent 创建、任务调度。

### 3.1 LangGraph 状态机

```typescript
interface SupervisorState {
  input: string;
  threadId: string;
  clarifiedInput?: string;
  decomposedTasks?: SubTask[];
  results: TaskResult[];
  finalOutput?: string;
  contextSnapshot?: ContextSnapshot;
}

const supervisorGraph = new StateGraph<SupervisorState>()
  .addNode('clarify', clarifyRequirementsNode)    // 需求澄清
  .addNode('decompose', decomposeTaskNode)        // 任务拆解
  .addNode('create_agents', createSubAgentsNode)  // 动态创建 Agent
  .addNode('orchestrate', orchestrateNode)        // 并行/串行调度
  .addNode('aggregate', aggregateResultsNode)     // 结果聚合
  .addNode('context_optimize', optimizeContextNode) // 上下文优化
  .compile();
```

### 3.2 节点实现

```typescript
// 需求澄清节点
async function clarifyRequirementsNode(state: SupervisorState) {
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });
  const response = await llm.invoke(`
    用户需求：${state.input}

    请判断需求是否足够清晰：
    - 如果清晰，返回原需求
    - 如果不清晰，返回澄清问题
  `);
  return { clarifiedInput: response.content };
}

// 任务拆解节点
async function decomposeTaskNode(state: SupervisorState) {
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });
  const response = await llm.invoke(`
    需求：${state.clarifiedInput}

    请将需求拆解为子任务，返回 JSON：
    {
      "tasks": [
        { "name": "任务名称", "description": "描述", "dependencies": [] }
      ]
    }
  `);
  return { decomposedTasks: JSON.parse(response.content).tasks };
}
```

## 4. Skill 引擎

支持对话式动态创建 Skill。

### 4.1 架构

```
用户自然语言 → Skill 分析 → Skill 生成 → Skill 注册 → 执行
```

### 4.2 核心接口

```typescript
interface Skill {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  promptTemplate: string;
  tools: string[];
  createdBy: string;
}

interface SkillEngine {
  createFromNaturalLanguage(userPrompt: string, tenantId: string): Promise<Skill>;
  execute(skillId: string, context: ExecutionContext): Promise<Result>;
  list(tenantId: string): Promise<Skill[]>;
}
```

### 4.3 对话式创建流程

```typescript
async createFromNaturalLanguage(userPrompt: string, tenantId: string): Promise<Skill> {
  // 1. LLM 分析需求，提取 Skill 定义
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });
  const spec = await llm.invoke(`
    分析以下需求，提取 Skill 定义：
    ${userPrompt}

    返回 JSON：
    {
      "name": "skill 名称（kebab-case）",
      "description": "描述",
      "capabilities": ["能力1", "能力2"],
      "suggested_tools": ["tool1", "tool2"]
    }
  `);

  // 2. 生成 prompt_template
  const skillSpec = JSON.parse(spec.content);
  const promptTemplate = await this.generatePromptTemplate(skillSpec);

  // 3. 创建 Skill
  const skill: Skill = {
    id: generateId(),
    tenantId,
    name: skillSpec.name,
    description: skillSpec.description,
    promptTemplate,
    tools: skillSpec.suggested_tools,
    createdBy: 'system' // 或当前用户
  };

  await this.skillRepo.create(skill);
  return skill;
}
```

## 5. Agent 工厂

```typescript
interface AgentFactory {
  createFromTemplate(templateId: string, config?: Partial<AgentConfig>): Promise<Agent>;
  createSpecialist(role: string, capabilities: string[]): Promise<Agent>;
}

class LangGraphAgentFactory implements AgentFactory {
  async createFromTemplate(templateId: string, config?: Partial<AgentConfig>): Promise<Agent> {
    const template = await this.templateRepo.findById(templateId);

    // 创建 LangGraph 状态机
    const graph = new StateGraph(this.createStateSchema(template))
      .addNode('agent', this.createAgentNode(template))
      .addNode('tools', this.createToolsNode(template))
      .addConditionalEdges('tools', this.createRouter(template))
      .compile();

    return {
      ...template,
      ...config,
      graph,
      status: 'active'
    };
  }
}
```

## 6. 相关文档

- [Supervisor 详细设计](./Supervisor.md)
- [Skill 详细设计](./Skill.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)
- 考核系统：[../04-assessment/README.md](../04-assessment/README.md)