# Redis 数据结构设计

## 1. 缓存策略

| Key 模式 | 类型 | TTL | 说明 |
|----------|------|-----|------|
| `user:{id}:profile` | JSON | 1小时 | 用户画像 |
| `thread:{id}:state` | JSON | 24小时 | 线程状态 |
| `task:{id}:progress` | JSON | 任务周期 | 任务进度 |
| `policy:{tenant}:cache` | JSON | 5分钟 | 策略缓存 |
| `skill:{tenant}:list` | JSON | 10分钟 | Skill 列表 |

## 2. 详细设计

### 2.1 用户画像缓存

```typescript
// Key: user:{userId}:profile
// TTL: 1小时

{
  "role": "product_manager",
  "techStack": ["TypeScript", "React"],
  "autoExecutableActions": ["search", "file_read"],
  "requireConfirmationActions": ["file_write", "api_call"],
  "forbiddenActions": ["delete", "system_config"],
  "timeoutThreshold": 3600,
  "learnedHabits": {}
}
```

### 2.2 线程状态缓存

```typescript
// Key: thread:{threadId}:state
// TTL: 24小时

{
  "status": "running",
  "currentNode": "orchestrate",
  "progress": 0.65,
  "pendingApprovals": ["subtask-123"],
  "createdAgents": ["agent-1", "agent-2"]
}
```

### 2.3 任务进度缓存

```typescript
// Key: task:{taskId}:progress
// TTL: 任务周期

{
  "total": 5,
  "completed": 3,
  "failed": 0,
  "subtasks": [
    { "id": "1", "status": "completed" },
    { "id": "2", "status": "completed" },
    { "id": "3", "status": "running" },
    { "id": "4", "status": "pending" },
    { "id": "5", "status": "pending" }
  ]
}
```

### 2.4 策略缓存

```typescript
// Key: policy:{tenantId}:{type}
// TTL: 5分钟

[
  {
    "id": "uuid",
    "name": "file_write_approval",
    "type": "approval",
    "condition": { "tool": "equals", "value": "file_write" },
    "action": { "type": "require_approval" },
    "priority": 10
  }
]
```

## 3. 实现

```typescript
class RedisCache {
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## 4. Pub/Sub

### 4.1 事件发布

```typescript
// 策略更新事件
await this.redis.publish('policy:updated', {
  policyId: id,
  version: newVersion,
  tenantId
});

// 任务状态变更
await this.redis.publish(`task:${taskId}:status`, {
  status: 'completed',
  output: result
});
```

### 4.2 事件订阅

```typescript
const subscriber = this.redis.duplicate();
await subscriber.subscribe('policy:updated');

subscriber.on('message', (channel, message) => {
  if (channel === 'policy:updated') {
    const event = JSON.parse(message);
    this.policyCache.invalidate(`policy:${event.tenantId}:*`);
  }
});
```

## 5. 相关文档

- [数据层设计](./README.md)
- [PostgreSQL 表结构](./PostgreSQL.md)
- [ClickHouse 时序表](./ClickHouse.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)