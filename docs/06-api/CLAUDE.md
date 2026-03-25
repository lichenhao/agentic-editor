# API 组开发规范

## 概述

本文件定义 06-api 目录下的开发规范和约束。

## 核心约束

### 1. 使用 Hono

必须使用 Hono 框架，禁止使用 Express/Koa：

```typescript
// ✅ 正确
import { Hono } from 'hono';
const app = new Hono();

// ❌ 禁止
import express from 'express';
const app = express();
```

### 2. 验证

使用 Zod 进行请求体验证：

```typescript
// ✅ 正确
const schema = z.object({
  input: z.string().min(1),
  options: z.object({
    priority: z.number().optional()
  }).optional()
});
const body = schema.parse(await c.req.json());

// ❌ 禁止
const body = await c.req.json();
if (!body.input) throw new Error('invalid');
```

### 3. 鉴权

所有路由必须使用鉴权中间件：

```typescript
// ✅ 正确
tasksRouter.post('/', authMiddleware, async (c) => { ... });

// ❌ 禁止
tasksRouter.post('/', async (c) => { ... }); // 无鉴权
```

### 4. 多租户

所有查询必须包含 tenant_id：

```typescript
// ✅ 正确
const tasks = await taskRepo.findBy({ tenantId: c.get('tenantId') });

// ❌ 禁止
const tasks = await taskRepo.findAll(); // 无租户过滤
```

### 5. SSE 规范

SSE 必须设置正确的响应头：

```typescript
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  }
});
```

## 模块划分

```
src/api/
├── index.ts           # Hono 入口
├── routes/
│   ├── tasks.ts       # 任务路由
│   ├── threads.ts     # 线程路由
│   ├── skills.ts      # Skill 路由
│   ├── agents.ts      # Agent 路由
│   ├── assessment.ts  # 考核路由
│   ├── policies.ts    # 策略路由
│   └── admin.ts       # 管理员路由
├── middleware/
│   ├── auth.ts        # JWT 鉴权
│   ├── tenant.ts      # 多租户中间件
│   ├── error.ts       # 错误处理
│   └── logger.ts      # 请求日志
└── sse/
    └── events.ts      # SSE 事件
```

## 错误处理约束

所有错误返回统一格式：

```typescript
return c.json({
  error: {
    code: 'ERROR_CODE',
    message: '错误消息',
    details: {}
  }
}, 400);
```

## 测试约束

- 所有 API 必须有对应测试
- 使用 supertest 进行集成测试

## 相关文档

- [API 设计](./README.md)
- [路由设计](./Routes.md)
- [SSE 设计](./SSE.md)
- 架构规范：[../01-arch/CLAUDE.md](../01-arch/CLAUDE.md)