# 分支管理设计

## 1. 概述

分支管理支持实验性探索和多方案并行，用户可以创建分支尝试不同方案，最后决定是否合并回主线程。

## 2. 场景

- **A/B 测试**：同一需求尝试不同实现方案
- **探索分支**：尝试新功能不影响主线
- **回滚恢复**：从分支恢复到之前的状态

## 3. 数据模型

```typescript
interface Branch {
  id: string;
  rootThreadId: string;
  parentBranchId?: string;
  name: string;
  status: 'active' | 'merged' | 'discarded';
  createdAt: Date;
}
```

## 4. 实现

```typescript
class BranchManager {
  async createBranch(
    parentThreadId: string,
    branchName: string
  ): Promise<Thread> {
    const parent = await this.threadRepo.findById(parentThreadId);

    return await this.threadRepo.create({
      tenantId: parent.tenantId,
      userId: parent.userId,
      title: branchName,
      context: parent.context,
      branchRootId: parent.branchRootId || parentThreadId,
      parentBranchId: parentThreadId,
      status: 'active'
    });
  }

  async mergeBranch(branchThreadId: string): Promise<void> {
    const branch = await this.threadRepo.findById(branchThreadId);
    const root = await this.threadRepo.findById(branch.branchRootId);

    // 合并上下文
    root.context = this.mergeContexts(root.context, branch.context);
    await this.threadRepo.update(root.id, { context: root.context });

    // 标记分支为已合并
    await this.threadRepo.update(branchThreadId, { status: 'merged' });
  }

  async getBranches(rootThreadId: string): Promise<Thread[]> {
    return await this.threadRepo.findBy({
      branchRootId: rootThreadId,
      status: 'active'
    });
  }
}
```

## 5. 相关文档

- [上下文管理设计](./README.md)
- [线程管理设计](./Thread.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)