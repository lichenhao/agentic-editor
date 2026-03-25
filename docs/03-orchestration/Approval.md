# 审批处理设计

## 1. 概述

审批处理实现人机协同交互，当 Agent 需要执行敏感操作时，暂停等待用户审批或根据 USER.md 自动决策。

## 2. 审批流程

```
Agent 请求操作
      │
      ▼
Policy Engine 检查
      │
      ▼
需要审批?
      │
      ├── 否 ──→ 执行操作
      │
      ▼
是
      │
      ▼
USER.md 自动决策
      │
      ├── 自动批准 → 执行操作
      ├── 自动拒绝 → 终止操作
      │
      ▼
需要用户确认
      │
      ▼
SSE 推送审批请求
      │
      ▼
用户决策（批准/拒绝/豁免）
      │
      ├── 批准 → 执行操作
      ├── 拒绝 → 终止操作
      └── 豁免 → 跳过考核
```

## 3. 数据模型

```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  subtask_id UUID REFERENCES task_subtasks(id),
  action VARCHAR(50) NOT NULL,     -- approve/reject/exempt
  approver_id UUID REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  subtask_id UUID,
  agent_id UUID NOT NULL,
  requested_action JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending/approved/rejected/expired
  auto_decision VARCHAR(50),           -- matched_habit/default_action/wait_user
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. 审批处理器实现

```typescript
class ApprovalHandler {
  constructor(
    private policyEngine: PolicyEngine,
    private userProfileManager: UserProfileManager,
    private approvalRepo: ApprovalRepository,
    private sseEmitter: SSEEmitter
  ) {}

  async requestApproval(
    taskId: string,
    agentId: string,
    action: PendingAction
  ): Promise<ApprovalRequest> {
    const context = {
      tenantId: action.tenantId,
      userId: action.userId,
      agentId,
      action: action.type,
      resource: action.resource
    };

    // 1. 检查是否需要审批
    const requiresApproval = await this.policyEngine.requiresApproval(action, context);

    if (!requiresApproval) {
      return { approved: true, autoApproved: true };
    }

    // 2. 尝试 USER.md 自动决策
    const autoDecision = await this.userProfileManager.autoDecide(
      action.userId,
      action
    );

    if (autoDecision.action === 'auto_approve') {
      await this.approvalRepo.create({
        taskId,
        agentId,
        action: 'approve',
        status: 'approved',
        auto_decision: autoDecision.reason,
        comment: 'Auto-approved by USER.md'
      });
      return { approved: true, autoApproved: true };
    }

    if (autoDecision.action === 'auto_reject') {
      await this.approvalRepo.create({
        taskId,
        agentId,
        action: 'reject',
        status: 'rejected',
        auto_decision: autoDecision.reason
      });
      return { approved: false, autoApproved: true };
    }

    // 3. 需要用户确认，创建审批请求
    const approvalRequest = await this.approvalRepo.createRequest({
      taskId,
      subtaskId: action.subtaskId,
      agentId,
      requestedAction: action,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 分钟过期
    });

    // 4. 通过 SSE 推送审批请求
    await this.sseEmitter.emit(`approval:${action.userId}`, {
      type: 'approval_request',
      requestId: approvalRequest.id,
      taskId,
      action: action.type,
      details: action.details
    });

    return {
      approved: false,
      autoApproved: false,
      requestId: approvalRequest.id,
      expiresAt: approvalRequest.expiresAt
    };
  }

  async processDecision(
    requestId: string,
    decision: ApprovalDecision
  ): Promise<void> {
    const request = await this.approvalRepo.findRequestById(requestId);

    // 更新审批请求状态
    await this.approvalRepo.updateRequest(requestId, {
      status: decision.approve ? 'approved' : 'rejected',
      approverId: decision.userId,
      comment: decision.comment
    });

    // 记录审批历史
    await this.approvalRepo.create({
      taskId: request.taskId,
      subtaskId: request.subtaskId,
      agentId: request.agentId,
      action: decision.approve ? 'approve' : 'reject',
      approverId: decision.userId,
      comment: decision.comment
    });

    // 处理豁免
    if (decision.exempt) {
      await this.exemptionRepo.create({
        task_id: request.taskId,
        agent_id: request.agentId,
        reason: decision.comment || 'user_exempt'
      });
    }

    // 通知任务继续执行
    await this.taskEventEmitter.emit(`approval:${request.taskId}`, {
      requestId,
      approved: decision.approve,
      exempt: decision.exempt,
      comment: decision.comment
    });

    // 从 USER.md 学习用户决策
    if (!decision.exempt) {
      await this.userProfileManager.learnFromFeedback(decision.userId, {
        type: request.requestedAction.type,
        outcome: decision.approve ? 'approved' : 'rejected'
      });
    }
  }
}
```

## 5. 审批等待处理

```typescript
class ApprovalWaitHandler {
  async waitForApproval(requestId: string, timeoutMs: number = 30 * 60 * 1000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false); // 超时
      }, timeoutMs);

      // 监听审批事件
      this.eventBus.subscribe(`approval:${requestId}`, (decision) => {
        clearTimeout(timeout);
        resolve(decision.approved);
      });
    });
  }

  async withApproval(
    action: PendingAction,
    handler: () => Promise<any>
  ): Promise<any> {
    const approval = await this.requestApproval(action.taskId, action.agentId, action);

    if (approval.approved) {
      return await handler();
    }

    if (approval.autoApproved) {
      return await handler();
    }

    // 等待用户审批
    const approved = await this.waitForApproval(approval.requestId);

    if (approved) {
      return await handler();
    }

    throw new Error('Approval denied or expired');
  }
}
```

## 6. SSE 事件

```typescript
// 审批请求事件
{
  "type": "approval_request",
  "requestId": "uuid",
  "taskId": "uuid",
  "action": "file_write",
  "details": {
    "path": "/data/report.txt",
    "content": "..."
  },
  "expiresAt": "2024-01-01T12:00:00Z"
}

// 审批结果事件
{
  "type": "approval_result",
  "requestId": "uuid",
  "taskId": "uuid",
  "approved": true,
  "exempt": false,
  "comment": "Approved"
}
```

## 7. 相关文档

- [编排层设计](./README.md)
- [策略引擎设计](./Policy.md)
- 上下文管理：[../05-context/README.md](../05-context/README.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)