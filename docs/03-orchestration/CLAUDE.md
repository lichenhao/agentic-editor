# 编排组开发规范

## 概述

本文件定义 03-orchestration 目录下的开发规范和约束。

## 核心约束

### 1. 策略检查前置

所有敏感操作前必须调用 Policy Engine：

```typescript
// ✅ 正确
const allowed = await policyEngine.checkPermission(agentId, action, context);
if (!allowed.allowed) {
  throw new Error(allowed.reason);
}

// ❌ 禁止
await executeSensitiveAction();
```

### 2. 审批流程标准化

所有审批必须通过 ApprovalHandler：

```typescript
// ✅ 正确
const approval = await approvalHandler.requestApproval(taskId, agentId, action);
if (!approval.approved) {
  return; // 或等待用户审批
}

// ❌ 禁止
if (isSensitive(action)) {
  // 直接执行或拒绝
}
```

### 3. SSE 事件推送

审批请求必须通过 SSE 推送：

```typescript
await sseEmitter.emit(`approval:${userId}`, approvalRequest);
```

### 4. USER.md 学习

用户决策后必须更新 USER.md：

```typescript
await userProfileManager.learnFromFeedback(userId, {
  type: action.type,
  outcome: approved ? 'approved' : 'rejected'
});
```

## 模块划分

```
src/orchestration/
├── AgentOrchestrator.ts     # 核心编排器
├── TaskScheduler.ts         # 任务调度
├── ResultAggregator.ts      # 结果聚合

src/policies/
├── PolicyEngine.ts          # 策略引擎
├── PermissionController.ts  # 权限控制
└── SecurityBoundary.ts      # 安全边界
```

## 策略配置约束

策略必须存储在数据库，禁止硬编码：

```typescript
// ✅ 正确
const policies = await policyRepo.findByType('permission', tenantId);

// ❌ 禁止
const ALLOWED_TOOLS = ['file_read', 'search'];
```

## 测试约束

- 策略引擎必须测试所有条件表达式组合
- 审批流程必须测试超时场景
- SSE 必须测试断线重连

## 相关文档

- [编排层设计](./README.md)
- [策略引擎设计](./Policy.md)
- [审批处理设计](./Approval.md)
- 架构规范：[../01-arch/CLAUDE.md](../01-arch/CLAUDE.md)