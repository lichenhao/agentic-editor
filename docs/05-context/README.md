# 上下文管理设计

## 1. 概述

上下文管理实现对话历史的智能管理，包括剪枝、压缩、优化，以及分支与共享上下文支持。

## 2. 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                    上下文管理 (Context)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ ContextManager   │  │  ThreadManager   │  │BranchManager │  │
│  │   (上下文管理)    │  │   (线程管理)     │  │ (分支管理)   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              USER.md Manager (用户画像)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 上下文管理

### 3.1 功能

- 自动剪枝低价值消息
- 压缩冗长输出
- 摘要历史对话
- 控制 token 消耗

### 3.2 实现

```typescript
class ContextManager {
  private readonly MAX_TOKENS = 100000;
  private readonly PRUNE_THRESHOLD = 0.8;

  async load(threadId: string): Promise<ContextSnapshot> {
    const thread = await this.threadRepo.findById(threadId);
    return this.decompress(thread.context);
  }

  async optimize(context: ContextSnapshot): Promise<ContextSnapshot> {
    let tokenCount = this.countTokens(context);

    if (tokenCount < this.MAX_TOKENS * this.PRUNE_THRESHOLD) {
      return context;
    }

    // 1. 剪枝
    let optimized = this.pruneLowValue(context);

    // 2. 压缩
    optimized = this.compress(optimized);

    // 3. 摘要
    optimized = await this.summarize(optimized);

    return optimized;
  }

  private pruneLowValue(context: ContextSnapshot): ContextSnapshot {
    return context.messages.filter(msg => {
      if (msg.role === 'system') return true;
      if (msg.type === 'tool_result' && msg.content.length > 10000) {
        return msg.importance > 0.5;
      }
      return true;
    });
  }

  private compress(context: ContextSnapshot): ContextSnapshot {
    // 合并相似的文件读取结果
    return context;
  }

  private async summarize(context: ContextSnapshot): Promise<ContextSnapshot> {
    const llm = new Anthropic({ model: 'claude-sonnet-4-6' });
    const summary = await llm.invoke(`
      对以下对话历史生成摘要，保留关键信息：
      ${JSON.stringify(context.messages.slice(0, 20))}
    `);
    // 替换为摘要
    return { ...context, summary: summary.content };
  }
}
```

## 4. 相关文档

- [线程管理设计](./Thread.md)
- [分支管理设计](./Branch.md)
- [USER.md 设计](./USER.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)