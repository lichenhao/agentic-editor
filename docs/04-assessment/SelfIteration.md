# 自我迭代设计

## 1. 概述

自我迭代机制实现 Agent 的持续进化，通过考核指标触发不同级别的迭代优化。

## 2. 触发条件

| 触发类型 | 条件 | 迭代级别 |
|----------|------|----------|
| **考核指标阈值** | 连续驳回次数 ≥ N | 重度 |
| **性能异常** | token 消耗超过同类任务平均值 2 倍 | 中度 |
| **用户主动请求** | 用户点击"优化此 Agent" | 中度 |
| **测评 Agent 推荐** | 测评 Agent 发现可优化模式 | 轻度/中度 |

## 3. 迭代级别

### 3.1 轻度优化（参数微调）

- **适用场景**：轻微性能下降、产出偶尔偏差
- **操作**：
  - 调整 AGENTS.md 中的工具使用规范
  - 微调 MEMORY.md 的经验教训
- **触发频率**：每次任务后检查

### 3.2 中度优化（提示词工程）

- **适用场景**：产出质量持续不佳、用户反馈反复
- **操作**：
  - 重新生成 SOUL.md 的核心原则部分
  - 优化系统提示词中的任务分解策略
- **触发频率**：连续 2 次评分 < 3

### 3.3 重度优化（重制 Agent）

- **适用场景**：连续多次不合格、工具调用频繁失败
- **操作**：
  1. 归档失败经验到知识库
  2. 销毁原 Agent
  3. 基于模板 + 失败经验生成新 Agent
  4. 重新注册
- **触发频率**：连续 3 次评分 < 2

## 4. 数据模型

```sql
CREATE TABLE iteration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  rejection_threshold INTEGER DEFAULT 3,
  token_anomaly_multiplier REAL DEFAULT 2.0,
  performance_threshold_ms INTEGER,
  auto_iteration_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iteration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,    -- light/medium/heavy
  before_config JSONB,
  after_config JSONB,
  status VARCHAR(20) DEFAULT 'running', -- running/completed/failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 5. 实现

```typescript
class SelfIterationManager {
  async shouldIterate(agentId: string): Promise<IterationTrigger | null> {
    const metrics = await this.getAgentMetrics(agentId);
    const config = await this.iterationConfigRepo.get(agentId.tenantId);

    // 检查连续驳回
    if (metrics.consecutiveRejections >= config.rejectionThreshold) {
      return { type: 'rejection_threshold', severity: 'heavy' };
    }

    // 检查 token 异常
    const avgToken = await this.getAverageTokenUsage(agentId);
    if (metrics.lastTokenUsed > avgToken * config.tokenAnomalyMultiplier) {
      return { type: 'performance_anomaly', severity: 'medium' };
    }

    // 检查用户请求
    const request = await this.userRequestRepo.findPending(agentId);
    if (request) {
      return { type: 'user_request', severity: 'medium' };
    }

    return null;
  }

  async iterate(agentId: string, trigger: IterationTrigger): Promise<IterationResult> {
    const agent = await this.agentRepo.findById(agentId);

    // 创建迭代日志
    const log = await this.iterationLogRepo.create({
      agentId,
      triggerType: trigger.type,
      severity: trigger.severity,
      beforeConfig: this.serializeConfig(agent),
      status: 'running'
    });

    try {
      let result: IterationResult;

      switch (trigger.severity) {
        case 'light':
          result = await this.lightOptimization(agent);
          break;
        case 'medium':
          result = await this.mediumOptimization(agent);
          break;
        case 'heavy':
          result = await this.heavyRecreate(agent);
          break;
      }

      // 更新迭代日志
      await this.iterationLogRepo.update(log.id, {
        afterConfig: result.newConfig,
        status: 'completed'
      });

      return result;
    } catch (error) {
      await this.iterationLogRepo.update(log.id, {
        status: 'failed',
        error: error.message
      });
      throw error;
    }
  }

  private async lightOptimization(agent: Agent): Promise<IterationResult> {
    // 1. 获取当前配置
    const agentsMd = await this.getConfig(agent.id, 'AGENTS.md');
    const memoryMd = await this.getConfig(agent.id, 'MEMORY.md');

    // 2. 获取最近反馈
    const feedback = await this.getRecentFeedback(agent.id);

    // 3. 调用 LLM 生成优化
    const improved = await this.llm.invoke(`
      当前 Agent 配置：
      AGENTS.md: ${agentsMd}
      MEMORY.md: ${memoryMd}

      用户反馈：
      ${feedback}

      请优化 AGENTS.md 或 MEMORY.md 中的相关内容。
      只返回需要修改的部分。
    `);

    // 4. 应用优化
    await this.saveConfig(agent.id, 'AGENTS.md', improved.agentsMd);
    await this.saveConfig(agent.id, 'MEMORY.md', improved.memoryMd);

    return { action: 'config_updated', newVersion: agent.version };
  }

  private async mediumOptimization(agent: Agent): Promise<IterationResult> {
    // 1. 获取失败案例
    const history = await this.assessmentRepo.getHistory(agent.id);
    const failedCases = history.filter(h => h.score < 3).slice(0, 10);

    // 2. 生成新的 SOUL.md
    const newSoulMd = await this.llm.invoke(`
      分析以下失败案例，重新生成 Agent 的 SOUL.md：

      ${failedCases.map(c => `任务: ${c.taskInput}\n反馈: ${c.feedback}\n`).join('\n')}

      SOUL.md 结构：
      ## 核心身份
      ## 核心原则（重点优化）
      ## 沟通风格
      ## 思维模式
    `);

    // 3. 应用
    await this.saveConfig(agent.id, 'SOUL.md', newSoulMd);

    return { action: 'soul_updated', newVersion: agent.version + 1 };
  }

  private async heavyRecreate(agent: Agent): Promise<IterationResult> {
    // 1. 归档失败经验
    await this.knowledgeBase.archiveFailure(agent);

    // 2. 销毁原 Agent
    await this.agentLifecycleService.destroy(agent.id);

    // 3. 获取模板和优秀配置
    const template = await this.templateRepo.findById(agent.templateId);
    const excellentTemplates = await this.knowledgeBase.getExcellentTemplates({
      role: agent.role,
      minScore: 4.5
    });

    // 4. 生成新配置
    const newConfig = await this.generateFromTemplate(
      template,
      agent.id,
      excellentTemplates[0]
    );

    // 5. 创建新 Agent
    const newAgentId = await this.agentLifecycleService.create(newConfig);

    return { action: 'recreated', newAgentId, oldAgentId: agent.id };
  }
}
```

## 6. 相关文档

- [考核系统设计](./README.md)
- [测评 Agent 设计](./Evaluator.md)
- [经验知识库设计](./KnowledgeBase.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)