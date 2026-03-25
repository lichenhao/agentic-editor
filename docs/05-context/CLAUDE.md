# 上下文组开发规范

## 概述

本文件定义 05-context 目录下的开发规范和约束。

## 核心约束

### 1. 上下文存储

上下文必须存储到数据库和 Redis：

```typescript
// ✅ 正确
await this.threadRepo.update(threadId, { context: compressed });
await this.redis.set(`thread:${threadId}:state`, JSON.stringify(state));

// ❌ 禁止
this.localContextCache.set(threadId, context);
```

### 2. USER.md 必须从数据库读取

```typescript
// ✅ 正确
const profile = await userProfileManager.getProfile(userId);

// ❌ 禁止
const defaultProfile = { autoExecutableActions: ['search', 'read'] };
```

### 3. 分支隔离

分支必须有独立的上下文：

```typescript
// ✅ 正确
const branch = await branchManager.createBranch(parentId, 'experiment');
// 分支有独立上下文，不影响主线程

// ❌ 禁止
// 分支共享主线程上下文
```

## 模块划分

```
src/context/
├── ContextManager.ts    # 上下文管理
├── ThreadManager.ts     # 线程管理
└── BranchManager.ts     # 分支管理

src/domain/services/
└── UserProfileManager.ts # USER.md 管理
```

## 上下文优化约束

上下文超过阈值必须优化：

```typescript
if (tokenCount > MAX_TOKENS * 0.8) {
  await contextManager.optimize(context);
}
```

## 测试约束

- 上下文压缩必须保持语义完整
- 分支合并必须正确处理冲突
- USER.md 学习必须持久化

## 相关文档

- [上下文管理设计](./README.md)
- [线程管理设计](./Thread.md)
- [分支管理设计](./Branch.md)
- [USER.md 设计](./USER.md)
- 架构规范：[../01-arch/CLAUDE.md](../01-arch/CLAUDE.md)