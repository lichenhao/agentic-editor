# 架构组 Agent 开发规范

## 概述

本文件定义 01-arch 目录下的开发规范和约束，所有在此目录下工作的 Agent 必须遵守。

## 核心约束

### 1. 数据库优先原则

**强制要求**：所有 Agent、Skill、Tool 定义必须从数据库读取，禁止在代码中硬编码。

```typescript
// ❌ 禁止：硬编码 Agent
const supervisor = {
  name: 'Supervisor',
  systemPrompt: 'You are a supervisor...'
};

// ✅ 正确：从数据库加载
const supervisors = await agentRepo.findByRole('supervisor', tenantId);
```

### 2. 双层架构

每个 Agent 由主设定（身份、验收标准）和技能设定（工作方式）共同构成：
- 主设定 → 数据库 `agent_profiles` 表
- 技能设定 → 数据库 `skills` 表
- 关联 → `agent_skills` 表

### 3. 配置文件分离

- **SOUL.md** → Agent 灵魂配置，存储在 `agent_templates` 表
- **USER.md** → 用户画像，存储在 `users` 表
- **AGENTS.md** → 行为准则，存储在 `agents` 表的 config 字段
- **MEMORY.md** → 长期记忆，存储在 `agent_templates` 表

### 4. 技术选型约束

| 组件 | 选型 | 约束 |
|------|------|------|
| API 框架 | Hono | 必须使用 Hono，禁止使用 Express/Koa |
| Agent 编排 | LangGraph | 必须使用 LangGraph |
| 主数据库 | PostgreSQL | 必须使用 PostgreSQL |
| 缓存 | Redis | 必须使用 Redis |
| 时序数据库 | ClickHouse | 必须使用 ClickHouse |

### 5. 多租户约束

- 所有数据操作必须包含 `tenant_id` 过滤
- Redis key 必须包含租户前缀：`{tenantId}:{resource}:{id}`
- 禁止跨租户数据访问

## 模块划分

### 目录结构

```
src/
├── config/           # 配置管理（环境变量）
├── db/              # 数据库层（连接、迁移、Repository）
├── domain/          # 领域层（实体、服务）
├── agents/          # Agent 实现
├── skills/          # Skill 引擎
├── context/         # 上下文管理
├── orchestration/   # 编排层
├── policies/        # 策略引擎
├── assessment/      # 考核系统
├── tools/           # 工具注册与执行
├── api/             # API 层
└── telemetry/       # 可观测性
```

## API 设计约束

### RESTful 规范

- 资源命名： kebab-case（如 `agent-profiles`）
- HTTP 方法：GET（查询）、POST（创建）、PUT（更新）、DELETE（删除）
- 响应格式：统一 JSON 包装

### 错误处理

```typescript
// 错误响应格式
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "错误描述",
    "details": {} // 可选的详细错误信息
  }
}
```

### 分页

所有列表 API 必须支持分页：

```
GET /api/agents?page=1&limit=20
```

## 测试约束

- 单元测试覆盖率 > 70%
- 集成测试覆盖核心流程
- 禁止 Mock 数据库操作（使用真实数据库或 testcontainers）

## 相关文档

- 总体架构：[README.md](./README.md)
- 数据库设计：[../07-storage/PostgreSQL.md](../07-storage/PostgreSQL.md)
- Agent 设计：[../02-agent/README.md](../02-agent/README.md)