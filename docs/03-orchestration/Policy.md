# 策略引擎设计

## 1. 概述

策略引擎实现"规范与执行分离"的设计原则，通过声明式配置定义操作权限、审批流程、安全边界。

## 2. 策略类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `permission` | 操作权限控制 | 禁止写入特定目录 |
| `approval` | 审批流程控制 | 写文件需要审批 |
| `security` | 安全边界 | 禁止执行危险命令 |
| `iteration` | 迭代策略 | 连续驳回 N 次触发重制 |

## 3. 数据模型

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,       -- permission/approval/security/iteration
  condition JSONB NOT NULL,        -- 规则条件
  action JSONB NOT NULL,           -- 规则动作
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policies_type ON policies(type);
CREATE INDEX idx_policies_tenant ON policies(tenant_id);
```

### 3.1 条件表达式

```json
{
  "field": "tool",
  "operator": "equals",
  "value": "file_write"
}

{
  "field": "path",
  "operator": "startsWith",
  "value": "/prod/"
}

{
  "and": [
    { "field": "role", "operator": "equals", "value": "admin" },
    { "field": "action", "operator": "in", "value": ["read", "write"] }
  ]
}
```

### 3.2 动作定义

```json
// 审批动作
{
  "type": "require_approval",
  "approvers": ["user", "admin"]
}

// 拒绝动作
{
  "type": "deny",
  "reason": "Security policy: forbidden path"
}

// 迭代动作
{
  "type": "trigger_iteration",
  "severity": "medium"
}
```

## 4. 策略引擎实现

```typescript
interface PolicyEngine {
  checkPermission(agentId: string, action: Action, context: PolicyContext): Promise<PolicyDecision>;
  requiresApproval(action: Action, context: PolicyContext): Promise<boolean>;
  evaluatePolicies(type: PolicyType, context: PolicyContext): Promise<PolicyResult[]>;
}

interface PolicyContext {
  tenantId: string;
  userId: string;
  agentId: string;
  action: string;
  resource?: string;
  metadata?: Record<string, any>;
}

interface PolicyDecision {
  allowed: boolean;
  reason: string;
  policyId?: string;
  action?: PolicyAction;
}

class PolicyEngineImpl implements PolicyEngine {
  private policyCache: Cache;

  async checkPermission(agentId: string, action: Action, context: PolicyContext): Promise<PolicyDecision> {
    const policies = await this.findPolicies('permission', context.tenantId);

    for (const policy of policies) {
      if (this.evaluateCondition(policy.condition, { ...context, action })) {
        return {
          allowed: policy.action.type === 'allow',
          reason: policy.name,
          policyId: policy.id
        };
      }
    }

    // 默认拒绝
    return { allowed: false, reason: 'default_deny' };
  }

  async requiresApproval(action: Action, context: PolicyContext): Promise<boolean> {
    const policies = await this.findPolicies('approval', context.tenantId);

    return policies.some(p =>
      this.evaluateCondition(p.condition, { ...context, action })
    );
  }

  private async findPolicies(type: string, tenantId: string): Promise<Policy[]> {
    // 尝试从缓存获取
    const cacheKey = `policies:${tenantId}:${type}`;
    const cached = await this.policyCache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 从数据库加载
    const policies = await this.policyRepo.findByType(type, tenantId);

    // 缓存 5 分钟
    await this.policyCache.set(cacheKey, JSON.stringify(policies), 300);

    return policies;
  }

  private evaluateCondition(condition: JSON, context: Record<string, any>): boolean {
    // 解析并评估条件表达式
    return this.expressionEvaluator.evaluate(condition, context);
  }
}
```

## 5. 策略热更新

```typescript
class PolicyHotReloader {
  async updatePolicy(id: string, updates: Partial<Policy>): Promise<void> {
    // 1. 更新数据库
    const newVersion = await this.policyRepo.update(id, {
      ...updates,
      version: { increment: 1 },
      updatedAt: new Date()
    });

    // 2. 清除缓存
    await this.policyCache.invalidate(`policies:*`);

    // 3. 通知所有节点（通过 Redis Pub/Sub）
    await this.redis.publish('policy:updated', {
      policyId: id,
      version: newVersion.version
    });
  }

  async onMessage(message: { policyId: string; version: number }) {
    // 新策略立即生效，不影响运行中的任务
    // 运行中的任务在下一次策略检查时加载新策略
    this.policyCache.invalidate(`policies:*`);
  }
}
```

## 6. 相关文档

- [编排层设计](./README.md)
- [审批处理设计](./Approval.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)