# USER.md 用户画像设计

## 1. 概述

USER.md 存储用户画像，用于长时间未响应时依据用户历史习惯自动执行决策。

## 2. 数据模型

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  user_md TEXT,                      -- 用户画像 USER.md
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 3. USER.md 结构

```markdown
# USER.md

## 基本信息
- 角色：产品经理/技术负责人
- 技术栈：TypeScript, Python, React

## 偏好设置
- 回复习惯：结论先行，需要时可展开细节
- 语言：中文交流，技术术语保留英文

## 授权范围（自动执行规则）
- 超时阈值：3600 秒
- 可自动执行的操作：
  - 搜索信息、读取文件、代码分析
- 需确认的操作：
  - 写入文件、发送消息、调用外部 API
- 禁止操作：
  - 删除文件、修改系统配置

## 项目上下文
- 当前项目：Agent Harness 架构设计
- 重点关注：考核机制、上下文管理、动态 Agent 创建
```

## 4. 实现

```typescript
interface UserProfile {
  // 基本信息
  role: string;
  techStack: string[];

  // 偏好设置
  replyHabit: string;
  language: string;

  // 授权范围
  timeoutThreshold: number;
  autoExecutableActions: string[];
  requireConfirmationActions: string[];
  forbiddenActions: string[];

  // 项目上下文
  currentProject: string;
  focusAreas: string[];

  // 学习到的习惯
  learnedHabits: Record<string, any>;
}

class UserProfileManager {
  async getProfile(userId: string): Promise<UserProfile> {
    const cached = await this.redis.get(`user:${userId}:profile`);
    if (cached) return JSON.parse(cached);

    const user = await this.userRepo.findById(userId);
    const profile = this.parseUserMd(user.user_md);

    await this.redis.set(`user:${userId}:profile`, JSON.stringify(profile));
    return profile;
  }

  async autoDecide(userId: string, action: PendingAction): Promise<AutoDecision> {
    const profile = await this.getProfile(userId);

    if (profile.autoExecutableActions.includes(action.type)) {
      return { action: 'auto_approve', reason: 'auto_executable' };
    }

    if (profile.requireConfirmationActions.includes(action.type)) {
      return { action: 'wait_user', reason: 'requires_confirmation' };
    }

    if (profile.forbiddenActions.includes(action.type)) {
      return { action: 'auto_reject', reason: 'forbidden' };
    }

    return { action: 'wait_user', reason: 'no_matching_rule' };
  }

  async learnFromFeedback(userId: string, action: UserAction): Promise<void> {
    const profile = await this.getProfile(userId);
    profile.learnedHabits[action.type] = action.outcome;

    await this.userRepo.updateUserMd(userId, this.serializeUserMd(profile));
    await this.redis.del(`user:${userId}:profile`);
  }
}
```

## 5. 相关文档

- [上下文管理设计](./README.md)
- [审批处理设计](../03-orchestration/Approval.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)