# API 层设计

## 1. 概述

API 层使用 Hono 框架提供 REST API 和 SSE 事件流，支持前端集成和管理后台。

## 2. 技术选型

- **框架**: Hono
- **验证**: Zod
- **鉴权**: JWT
- **SSE**: Server-Sent Events

## 3. 核心路由

```
/api
├── /tasks          # 任务管理
├── /threads        # 线程管理
├── /skills         # Skill 管理
├── /agents         # Agent 管理
├── /assessment     # 考核管理
├── /policies       # 策略管理
├── /admin          # 管理员接口
└── /events         # SSE 事件流
```

## 4. 相关文档

- [路由设计](./Routes.md)
- [SSE 设计](./SSE.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)