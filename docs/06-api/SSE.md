# SSE 事件流设计

## 1. 概述

SSE (Server-Sent Events) 用于实时推送任务进度、审批请求等事件到客户端。

## 2. 事件类型

| 事件 | 说明 | 触发时机 |
|------|------|----------|
| `task_progress` | 任务进度更新 | 任务状态变化 |
| `approval_request` | 审批请求 | 需要用户审批 |
| `approval_result` | 审批结果 | 用户做出决策 |
| `task_completed` | 任务完成 | 任务结束 |
| `task_failed` | 任务失败 | 任务异常 |

## 3. 事件格式

```typescript
// task_progress
{
  "type": "task_progress",
  "taskId": "uuid",
  "progress": 0.65,
  "currentStep": "executing_subtask_2",
  "subtasks": [
    { "id": "1", "status": "completed" },
    { "id": "2", "status": "running" },
    { "id": "3", "status": "pending" }
  ]
}

// approval_request
{
  "type": "approval_request",
  "requestId": "uuid",
  "taskId": "uuid",
  "action": "file_write",
  "details": { "path": "/data/report.txt" },
  "expiresAt": "2024-01-01T12:00:00Z"
}

// task_completed
{
  "type": "task_completed",
  "taskId": "uuid",
  "output": "...",
  "metrics": {
    "tokenUsed": 15000,
    "durationMs": 30000
  }
}
```

## 4. 实现

```typescript
import { Hono } from 'hono';

const sseRouter = new Hono();

// 获取任务事件流
sseRouter.get('/tasks/:id', authMiddleware, async (c) => {
  const taskId = c.req.param('id');

  const stream = new ReadableStream({
    start(controller) {
      // 订阅任务事件
      const unsubscribe = eventBus.subscribe(`task:${taskId}`, (event) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      });

      // 心跳保持连接
      const heartbeat = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
      }, 30000);

      // 清理
      c.req.raw.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(heartbeat);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
});

// 获取审批事件流
sseRouter.get('/approvals', authMiddleware, async (c) => {
  const userId = c.get('userId');

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = eventBus.subscribe(`approval:${userId}`, (event) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      });

      c.req.raw.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
});
```

## 5. 客户端使用

```typescript
// 订阅任务进度
const eventSource = new EventSource('/api/events/tasks/task-123');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'task_progress':
      updateProgressBar(data.progress);
      break;
    case 'task_completed':
      showResult(data.output);
      eventSource.close();
      break;
    case 'task_failed':
      showError(data.error);
      eventSource.close();
      break;
  }
};

eventSource.onerror = () => {
  // 重连逻辑
  eventSource.close();
};
```

## 6. 相关文档

- [API 设计](./README.md)
- [路由设计](./Routes.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)