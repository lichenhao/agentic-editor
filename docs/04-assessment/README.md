# 考核系统设计

## 1. 概述

考核系统实现 Agent 质量评估、自我迭代、经验知识库功能，是系统自进化的核心。

## 2. 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                      考核系统 (Assessment)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │AssessmentEngine  │  │SelfIterationMgr  │  │  Evaluator   │  │
│  │   (考核引擎)      │  │  (自我迭代)       │  │  (测评Agent)  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │RecreateManager   │  │ExemptionManager  │  │  Leaderboard │  │
│  │   (重制管理)      │  │   (豁免管理)     │  │   (排行榜)   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              KnowledgeBase (经验知识库)                    │  │
│  │  - 失败案例归档  - 优秀模板检索  - 语义搜索                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 考核流程

```
任务完成
    │
    ▼
采集考核指标
(token消耗、耗时、产出)
    │
    ▼
用户反馈 (评分/评论)
    │
    ▼
Assessment Engine 评估
    │
    ▼
触发迭代条件?
    │
    ├── 否 → 归档
    │
    ▼
是
SelfIteration Manager
    │
    ├── 轻度 → 更新 AGENTS.md/MEMORY.md
    ├── 中度 → 更新 SOUL.md
    └── 重度 → 重制 Agent
```

## 4. 考核指标

```typescript
interface AssessmentMetrics {
  // 定量指标
  tokenUsed: number;
  durationMs: number;
  toolCallCount: number;
  toolErrorCount: number;

  // 质量指标
  feedbackScore: number;        // 1-5 用户评分
  feedbackText?: string;
  revisionCount: number;        // 修改次数

  // 计算指标
  calculatedScore: number;      // 综合评分
  consecutiveRejections: number; // 连续驳回次数
}
```

## 5. 相关文档

- [自我迭代设计](./SelfIteration.md)
- [测评 Agent 设计](./Evaluator.md)
- [经验知识库设计](./KnowledgeBase.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)