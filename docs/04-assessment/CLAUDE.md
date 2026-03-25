# 考核组开发规范

## 概述

本文件定义 04-assessment 目录下的开发规范和约束。

## 核心约束

### 1. 考核数据存储

所有考核数据必须存储到 ClickHouse（时序数据）和 PostgreSQL（结构化数据）：

```typescript
// ✅ 正确
await this.clickHouse.insert('assessment_records', metrics);
await this.postgres.assessmentRepo.create(record);

// ❌ 禁止
this.inMemoryMetrics.push(metrics);
```

### 2. 迭代触发自动化

迭代触发必须通过 SelfIterationManager，禁止直接操作 Agent：

```typescript
// ✅ 正确
await this.selfIterationManager.iterate(agentId, trigger);

// ❌ 禁止
await this.agentFactory.recreate(agentId);
```

### 3. 知识库更新

失败案例必须归档到知识库：

```typescript
// ✅ 正确
await this.knowledgeBase.archiveFailure(agent);

// ❌ 禁止
// 不记录失败案例
```

### 4. 测评 Agent 集成

质量评估必须通过测评 Agent：

```typescript
// ✅ 正确
const evaluation = await evaluatorAgent.evaluate(taskId, agentId, output);

// ❌ 禁止
const score = this.calculateScore(output); // 手动计算
```

## 模块划分

```
src/assessment/
├── AssessmentEngine.ts        # 考核引擎
├── SelfIterationManager.ts    # 自我迭代管理器
├── EvaluatorAgent.ts          # 测评 Agent
├── RecreateManager.ts         # 重制管理
├── ExemptionManager.ts        # 豁免管理
└── LeaderboardService.ts      # 排行榜服务

src/domain/services/
└── KnowledgeBase.ts           # 经验知识库
```

## 指标采集约束

所有 Agent 执行后必须采集以下指标并存储：

```typescript
await metricsRepo.record({
  agentId,
  taskId,
  tokenUsed,
  durationMs,
  score,
  timestamp: new Date()
});
```

## 测试约束

- 自我迭代必须测试所有触发条件
- 测评 Agent 必须测试不同质量级别的输出
- 知识库必须测试向量搜索准确性

## 相关文档

- [考核系统设计](./README.md)
- [自我迭代设计](./SelfIteration.md)
- [测评 Agent 设计](./Evaluator.md)
- [经验知识库设计](./KnowledgeBase.md)
- 架构规范：[../01-arch/CLAUDE.md](../01-arch/CLAUDE.md)