# Agentic Editor 项目知识库

## 项目结构

```
server/src/
├── agents/                    # Agent 核心模块
│   ├── base/                  # 基础接口和类
│   │   ├── agent.interface.ts    # AgentResult, Task, AgentContext 等核心接口
│   │   ├── base.agent.ts         # BaseAgent 基础类
│   │   └── response.interface.ts # 响应相关接口
│   ├── director/              # Director Agent (主控 Agent)
│   │   └── director.agent.ts     # 主编排逻辑，包含 ReAct 循环
│   ├── engine/                # Agent 引擎
│   │   └── agent.engine.ts       # 消息处理入口，协调 Director 执行
│   ├── factory/               # Agent 工厂
│   │   └── agent.factory.ts      # 动态创建和执行子 Agent
│   ├── loader/                # 加载器
│   │   ├── agent.loader.ts       # 从数据库加载 Agent 定义
│   │   ├── agent-profile.loader.ts # 从数据库加载 Agent Profile
│   │   └── skill.loader.ts       # 加载 Skill 配置
│   ├── executor/              # 执行器
│   │   └── executor.ts           # Skill 执行器
│   ├── manager/               # 管理器
│   │   └── agent.manager.ts      # Agent 管理
│   ├── orchestrator.ts        # 编排器
│   ├── registry.ts            # 注册表
│   └── service/               # 服务层
│       ├── project-agent.service.ts
│       ├── response-builder.service.ts
│       ├── preference.service.ts
│       └── feedback-processor.service.ts
│
├── services/                  # 业务服务
│   ├── websocket.service.ts     # WebSocket 消息处理
│   ├── message.service.ts       # 消息(Context) CRUD
│   ├── task.service.ts          # 任务管理
│   └── project.service.ts       # 项目管理
│
├── infrastructure/            # 基础设施
│   └── database/
│       └── prisma.ts            # Prisma 客户端
│
└── api/                       # API 路由

client/src/
├── components/               # React 组件
│   ├── Chat/                 # 聊天相关
│   │   ├── ChatPanel.tsx       # 聊天面板容器
│   │   ├── MessageList.tsx     # 消息列表
│   │   ├── MessageBubble.tsx   # 消息气泡
│   │   └── MessageInput.tsx    # 消息输入
│   ├── Task/                  # 任务相关
│   │   └── TaskProgressDrawer.tsx # 任务进度抽屉
│   └── Layout/                # 布局组件
├── services/
│   ├── ws-singleton.ts        # WebSocket 单例
│   └── api.ts                 # API 调用
└── types/
    └── index.ts               # 类型定义
```

## 核心概念

### 1. 消息角色 (MessageRole)
- `user`: 用户消息
- `assistant`: Agent 回复消息（包含真实工作产出）
- `system`: 系统状态消息（任务创建/开始/完成等）

### 2. Agent 类型 (AgentType)
- `director`: 主控 Agent，负责规划和协调
- `asset`: 美术 Agent
- `storyboard`: 分镜 Agent
- `video`: 视频 Agent
- `editing`: 剪辑 Agent

### 3. 任务状态 (TaskStatus)
- `PENDING`: 等待执行
- `IN_PROGRESS`: 执行中
- `COMPLETED`: 完成
- `WAITING_APPROVAL`: 等待用户确认
- `FAILED`: 失败
- `APPROVED`: 已确认
- `NEEDS_REVISION`: 需要修改

## 消息流转流程

```
用户发送消息
    ↓
WebSocket → websocket.service.ts processMessage()
    ↓
agent.engine.ts process() - 创建 Agent 上下文
    ↓
director.agent.ts executeTask() - 执行主逻辑
    ↓
ReAct 循环 + 子 Agent 调用
    ↓
1. 创建消息: createMessage({ role: 'assistant', employeeId: 'director', content: ... })
2. 发送 WebSocket: sendEvent({ type: 'message', ... })
3. 任务状态变更时也写入系统消息
    ↓
前端接收并渲染
```

## 关键函数

### 消息写入 (message.service.ts)
```typescript
createMessage({
  sessionId: string,
  role: 'user' | 'assistant' | 'system',  // 重要：assistant = Agent工作产出，system = 系统状态
  content: string,
  employeeId?: string  // Agent 类型
})
```

### WebSocket 消息类型
- `message`: Agent 回复（role: assistant）
- `thinking`: Agent 工作中
- `done`: 完成
- `task_created`: 任务创建
- `task_started`: 任务开始
- `task_progress`: 任务进度
- `task_completed`: 任务完成
- `task_waiting_approval`: 等待确认

## 常见问题

### Q: 消息 role 应该用哪个？
- **assistant**: Agent 的实际工作产出（分析结果、生成内容等）
- **system**: 系统状态通知（任务创建/开始/完成/等待确认）
- **user**: 用户输入

### Q: done 消息什么时候发送？
- 只有在**不需要用户介入**时才发送 done
- 如果任务需要用户确认 (requiresApproval)，则发送 task_waiting_approval

### Q: 前端如何处理消息？
- `message` 类型 → 渲染到消息列表
- `done` 类型 → 清除 thinkingStatus 状态卡片（不渲染到消息列表）
- `task_*` 类型 → 更新任务列表
- `thinking` 类型 → 显示状态卡片

## 修改日志

### 2026-03-23
- 修复 done 消息时机：只在不需要用户介入时发送
- 添加 task_progress 前端处理
- 修复 message 类型渲染验证
- 任务状态变更写入消息表 (Context)