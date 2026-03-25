# Agent 组开发规范

## 概述

本文件定义 02-agent 目录下的开发规范和约束。

## 核心约束

### 1. 数据库优先

所有 Agent 定义必须从数据库读取：

```typescript
// ✅ 正确
const agents = await agentRepo.findByRole('supervisor', tenantId);

// ❌ 禁止
const supervisor = { name: 'Supervisor', ... };
```

### 2. Agent 工厂模式

使用工厂模式创建 Agent，禁止直接实例化：

```typescript
// ✅ 正确
const agent = await agentFactory.createFromTemplate(templateId);

// ❌ 禁止
const agent = new SupervisorAgent();
```

### 3. LangGraph 状态机

所有 Agent 必须基于 LangGraph 实现状态机：

```typescript
const graph = new StateGraph<AgentState>()
  .addNode('agent', agentNode)
  .addNode('tools', toolsNode)
  .compile();
```

### 4. Skill 动态注册

Skill 创建后必须注册到数据库，禁止内存缓存：

```typescript
// ✅ 正确
await skillRepo.create(skill);
await skillRegistry.refresh(tenantId);

// ❌ 禁止
skillRegistry.localSet(skill);
```

## 模块划分

```
src/agents/
├── SupervisorAgent.ts    # Supervisor 实现
├── AgentBase.ts          # Agent 基类
├── AgentFactory.ts       # Agent 工厂
└── pools/
    └── AgentPool.ts      # Agent 池管理

src/skills/
├── SkillEngine.ts        # Skill 引擎
├── SkillCreator.ts       # 对话式创建
├── SkillRegistry.ts      # Skill 注册表
└── SkillExecutor.ts      # Skill 执行器
```

## 配置文件约束

Agent 配置存储位置：

| 配置 | 存储位置 | 可被迭代修改 |
|------|---------|-------------|
| SOUL.md | `agent_templates.system_prompt` | 是 |
| AGENTS.md | `agents.config` | 是 |
| MEMORY.md | `agent_templates.memory` | 是 |

## 指标采集

所有 Agent 必须采集以下指标：

```typescript
interface AgentMetrics {
  tokenUsed: number;
  durationMs: number;
  toolCallCount: number;
  errorCount: number;
  taskCount: number;
}
```

## 相关文档

- [Agent 核心设计](./README.md)
- [Supervisor 详细设计](./Supervisor.md)
- [Skill 详细设计](./Skill.md)
- 架构规范：[../01-arch/CLAUDE.md](../01-arch/CLAUDE.md)