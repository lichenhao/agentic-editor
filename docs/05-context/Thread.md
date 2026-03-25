# 线程管理设计

## 1. 概述

线程（Thread）管理对话上下文，每个线程对应一个独立的对话会话。

## 2. 数据模型

```sql
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255),
  context JSONB,                   -- 压缩后的对话历史
  context_tokens INTEGER DEFAULT 0,
  branch_root_id UUID,             -- 分支根线程
  parent_branch_id UUID,           -- 父分支（如果是分支）
  status VARCHAR(50) DEFAULT 'active', -- active/archived/merged
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_threads_branch ON threads(branch_root_id);
```

## 3. 核心接口

```typescript
interface ThreadManager {
  create(userId: string, tenantId: string): Promise<Thread>;
  get(threadId: string): Promise<Thread>;
  updateContext(threadId: string, context: ContextSnapshot): Promise<void>;
  archive(threadId: string): Promise<void>;
  list(userId: string, options?: ListOptions): Promise<Thread[]>;
}
```

## 4. 实现

```typescript
class ThreadManagerImpl implements ThreadManager {
  async create(userId: string, tenantId: string): Promise<Thread> {
    const thread: Thread = {
      id: generateId(),
      tenantId,
      userId,
      title: '新对话',
      context: [],
      contextTokens: 0,
      status: 'active'
    };

    await this.threadRepo.create(thread);
    return thread;
  }

  async updateContext(threadId: string, context: ContextSnapshot): Promise<void> {
    const compressed = this.compress(context);
    const tokenCount = this.countTokens(compressed);

    await this.threadRepo.update(threadId, {
      context: compressed,
      contextTokens: tokenCount,
      updatedAt: new Date()
    });
  }
}
```

## 5. 相关文档

- [上下文管理设计](./README.md)
- [分支管理设计](./Branch.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)