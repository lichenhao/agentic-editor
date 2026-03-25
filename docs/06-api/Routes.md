# 路由设计

## 1. 任务 API

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | /api/tasks | 创建任务 |
| GET | /api/tasks/:id | 获取任务详情 |
| GET | /api/tasks | 任务列表 |
| POST | /api/tasks/:id/cancel | 取消任务 |
| POST | /api/tasks/:id/feedback | 提交反馈 |

## 2. 线程 API

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | /api/threads | 创建线程 |
| GET | /api/threads/:id | 获取线程 |
| GET | /api/threads | 线程列表 |
| POST | /api/threads/:id/branch | 创建分支 |
| POST | /api/threads/:id/branch/:branchId/merge | 合并分支 |

## 3. Skill API

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | /api/skills | 创建 Skill |
| GET | /api/skills | Skill 列表 |
| GET | /api/skills/:id | Skill 详情 |

## 4. Agent API

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | /api/agents | Agent 列表 |
| GET | /api/agents/:id | Agent 详情 |
| GET | /api/agents/:id/assessment | 考核记录 |
| POST | /api/agents/:id/reset | 重制 Agent |

## 5. 考核 API

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | /api/assessment/policies | 策略列表 |
| POST | /api/assessment/policies | 创建策略 |
| GET | /api/assessment/leaderboard | 排行榜 |

## 6. 审批 API

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | /api/tasks/:id/approvals | 提交审批决策 |
| POST | /api/tasks/:id/exempt | 标记豁免 |

## 7. 实现示例

```typescript
import { Hono } from 'hono';
import { z } from 'zod';

const tasksRouter = new Hono();

// 创建任务
tasksRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const validated = createTaskSchema.parse(body);

  const task = await taskService.create({
    ...validated,
    userId: c.get('userId'),
    tenantId: c.get('tenantId')
  });

  return c.json(task, 201);
});

// 获取任务
tasksRouter.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const task = await taskService.get(id);

  if (!task) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(task);
});

// 提交反馈
tasksRouter.post('/:id/feedback', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const validated = feedbackSchema.parse(body);

  await taskService.submitFeedback(id, validated);

  return c.json({ success: true });
});
```

## 8. 响应格式

```typescript
// 成功
{
  "data": { ... }
}

// 错误
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "错误描述",
    "details": {}
  }
}

// 分页
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## 9. 相关文档

- [API 设计](./README.md)
- [SSE 设计](./SSE.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)