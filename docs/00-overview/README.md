# 设计文档索引

## 概述

本文档是 Agent Harness 系统设计文档的索引目录。

## 文档结构

```
docs/
├── 00-overview/              # 顶层设计文档
│   ├── README.md            # 本文件
│   └── GLOSSARY.md          # 术语表
├── 01-arch/                  # 总体架构
│   ├── README.md            # 架构总览
│   └── CLAUDE.md            # 架构组规范
├── 02-agent/                 # Agent 核心
│   ├── README.md            # Agent 核心设计
│   ├── Supervisor.md        # Supervisor 设计
│   ├── Skill.md             # Skill 设计
│   └── CLAUDE.md            # Agent 组规范
├── 03-orchestration/        # 编排层
│   ├── README.md            # 编排层设计
│   ├── Policy.md            # 策略引擎设计
│   ├── Approval.md          # 审批处理设计
│   └── CLAUDE.md            # 编排组规范
├── 04-assessment/           # 考核系统
│   ├── README.md            # 考核系统设计
│   ├── SelfIteration.md     # 自我迭代设计
│   ├── Evaluator.md         # 测评 Agent 设计
│   ├── KnowledgeBase.md     # 经验知识库设计
│   └── CLAUDE.md            # 考核组规范
├── 05-context/              # 上下文管理
│   ├── README.md            # 上下文管理设计
│   ├── Thread.md            # 线程管理设计
│   ├── Branch.md            # 分支管理设计
│   ├── USER.md              # 用户画像设计
│   └── CLAUDE.md            # 上下文组规范
├── 06-api/                  # API 层
│   ├── README.md            # API 设计
│   ├── Routes.md            # 路由设计
│   ├── SSE.md               # SSE 设计
│   └── CLAUDE.md            # API 组规范
├── 07-storage/              # 数据层
│   ├── README.md            # 数据层设计
│   ├── PostgreSQL.md        # PostgreSQL 表结构
│   ├── Redis.md             # Redis 数据结构
│   ├── ClickHouse.md        # ClickHouse 时序表
│   └── CLAUDE.md            # 存储组规范
├── files.yaml               # 配置文件体系定义
├── mrd.md                   # 项目需求文档
├── 自我迭代.md               # 自我迭代机制设计
├── SOUL.md                  # Agent 灵魂示例
└── USER.md                  # 用户画像示例
```

## 阅读顺序

### 入门
1. [MRD](./mrd.md) - 了解项目需求和愿景

### 架构概览
2. [01-arch/README.md](./01-arch/README.md) - 总体架构
3. [07-storage/](./07-storage/) - 了解数据层设计

### 核心模块
4. [02-agent/](./02-agent/) - Agent 核心设计
5. [03-orchestration/](./03-orchestration/) - 编排层设计
6. [04-assessment/](./04-assessment/) - 考核系统设计
7. [05-context/](./05-context/) - 上下文管理设计

### API 与集成
8. [06-api/](./06-api/) - API 层设计

### 参考
- [GLOSSARY.md](./GLOSSARY.md) - 术语表
- [files.yaml](./files.yaml) - 配置文件体系

## 开发阶段

| 阶段 | 主要内容 | 关键文档 |
|------|----------|----------|
| Phase 1 | 基础架构 | 01-arch, 07-storage |
| Phase 2 | Agent 核心 | 02-agent |
| Phase 3 | 上下文管理 | 05-context |
| Phase 4 | 编排层 | 03-orchestration |
| Phase 5 | 考核系统 | 04-assessment |
| Phase 6 | API 层 | 06-api |

## 相关链接

- 项目根目录: `/Users/ryota/works/agentic-editor`
- 设计文档: `/Users/ryota/works/agentic-editor/docs`
- 源代码: `/Users/ryota/works/agentic-editor/src`