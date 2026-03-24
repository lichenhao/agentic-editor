# Multi-Agent 架构设计方案（完整版 + 子包架构）

## 背景

用户需要全新设计 multi-agent 方案，忽略之前的设计。新方案定位：**用户和虚拟员工（Multi-Agent）通过聊天沟通完成项目的App**。

---

## 子包架构设计（npm workspaces）

采用 **Monorepo + 子包拆分** 策略，将可独立复用、不需要经常修改的功能拆分为独立子包，降低复杂度膨胀问题。

```
agentic-editor/
├── packages/
│   ├── core/              # 核心类型和接口定义
│   ├── database/          # 数据库访问层
│   ├── ai/                # AI 服务集成
│   ├── classifier/        # 输入分类器
│   ├── scheduler/         # DAG 任务调度器
│   ├── optimizer/         # 自我优化引擎
│   └── performance/       # 绩效考核服务
├── server/                # 主服务（依赖所有 packages）
└── client/                # 前端
```

### 子包详细设计

#### 1. @agentic-editor/core
**职责**：所有类型定义、接口、枚举

#### 2. @agentic-editor/database
**职责**：Prisma Client 封装、数据库操作基础方法

#### 3. @agentic-editor/ai
**职责**：统一 AI 服务调用（Claude、OpenAI 等）

#### 4. @agentic-editor/classifier
**职责**：用户输入分类、任务复杂度评估

#### 5. @agentic-editor/scheduler
**职责**：任务依赖管理、并行/串行调度（可独立测试）

#### 6. @agentic-editor/optimizer
**职责**：分析失败模式、生成优化建议、执行优化

#### 7. @agentic-editor/performance
**职责**：记录和查询 Agent 工作表现

---

## 核心需求（最终版）

### 0. 虚拟员工体系 + CoA 工作模式
所有参与会话的都是虚拟员工（Agent），具备 Chain of Actions 工作模式 - 根据任务复杂度自行决策

### 1. 会话创建时自动分配通用智能助理（秘书角色）
- 不擅长具体工作，但非常擅长找到做这个工作的职工
- 担任任务分配、监督、验收汇报工作
- 兼具经理人角色

### 2. 用户输入内容分类处理
Secretary 分析用户输入，属于以下哪一类：
- **问题类**：直接调用工具、Skills、数据库、搜索互联网等查找相关内容，然后总结回答
- **需求类**：先沟通整理好需求（多轮对话），确认需求无疏漏后，用户人工最终确认，并可不断根据用户反馈训练评估标准（后续可自动确认）
- **执行类**：直接调配其他虚拟员工（子Agent）执行

### 3. 任务复杂度分析 + 智能工作方式
- 所有任务先自行分析是否复杂任务
- 非复杂任务：不使用 CoT 工作法，不过度拆分，高效完成
- 复杂任务：使用 CoT 深度思考、拆分子任务、DAG 执行
- 考核标准：**最高效+高质量完成工作**

### 4. 数字员工考核记录 + 自我优化触发策略
- 记录每个虚拟员工的工作表现（成功/失败/被打回次数）
- 当专业技能方向工作发生多次失误、错误、被打回时，触发自我优化策略
- 自我优化：分析错误原因、调整提示词、更新技能配置

### 5. 新增领域问题自动处理
- 自动进行领域知识搜集
- 分析生成新的岗位角色
- 设置对应的工作技能（Skills）
- 预设置工作流程、规范、验收标准
- 配置配套工具（MCP、Tools、API）

### 6. 员工设置落数据库
- 岗位、技能、偏好等全部存入数据库
- 方便后续快速指派工作

### 7. 简单工作创建普通 Agent 工具
- 如文案标注等简单型快速生成工作

### 8. 任务拆分后支持串行/并行
- Agent 调度执行
- 支持用户介入或工作完成

### 9. 沟通和产出记录到上下文并落数据库

### 10. 项目制管理
- 用户可以有多个项目（Project）
- 每个项目下有多个会话（Session）
- 项目可配置不同的虚拟员工团队

### 11. UI 简化
- 移除 Task List 独立侧边栏 UI
- 任务进度和结果在对话流中展示
- 产物在独立面板展示（可折叠）

---

## 架构设计

### 角色类型定义（扁平化架构）

采用 **Secretary 中心协调模式**：
- 所有 Agent 都是扁平化的虚拟员工角色
- Secretary 作为唯一协调中心，负责任务分配和流程管理
- 各 Agent 之间不直接通信，都通过 Secretary 协调
- 工作流程是 DAG（有向无环图），支持打回重做，不支持环形依赖

| 角色 | 说明 | 典型场景 |
|------|------|---------|
| `secretary` | 通用智能助理/秘书（协调中心） | 会话创建时自动分配，负责协调所有 Agent |
| `specialist` | 领域专家 | 具备专业技能，负责具体执行 |
| `tool` | 工具人 | 简单快速工作 |

### 用户输入分类器

```typescript
// 用户输入类型
type UserInputType = 'QUESTION' | 'REQUIREMENT' | 'EXECUTION'

// 分类结果
interface InputClassification {
  type: UserInputType
  confidence: number  // 置信度
  reasoning: string   // 分类理由
  suggestedAction: string  // 建议动作
}

// 问题类：直接回答 + 工具调用
// 需求类：多轮沟通 → 需求确认 → 执行
// 执行类：直接分配任务给子 Agent
```

### 任务复杂度评估

```typescript
// 任务复杂度
type TaskComplexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX'

// 评估因素
interface ComplexityFactors {
  scope: number        // 范围大小
  dependencies: number // 依赖数量
  uncertainty: number  // 不确定性
  domainKnowledge: number // 领域知识需求
}

// 工作方式决策
const workStyleDecision = (complexity: TaskComplexity) => {
  if (complexity === 'SIMPLE') {
    // 直接执行，不过度拆分，不使用 CoT
    return { useCoT: false, splitTasks: false, mode: 'DIRECT' }
  }
  if (complexity === 'MEDIUM') {
    // 轻度拆分，适度思考
    return { useCoT: true, splitTasks: true, mode: 'HYBRID' }
  }
  // COMPLEX: 完整 CoT，深度拆分，DAG 执行
  return { useCoT: true, splitTasks: true, mode: 'DAG' }
}
```

### 数字员工考核系统

```prisma
// 员工绩效考核记录
model AgentPerformance {
  id            String    @id @default(uuid())
  agentType     String    // 虚拟员工类型
  projectId     String?   // 所属项目（可选）

  // 考核指标
  totalTasks    Int       @default(0)    // 总任务数
  successCount  Int       @default(0)    // 成功数
  failCount     Int       @default(0)    // 失败数
  rejectCount   Int       @default(0)    // 被打回次数
  avgDuration   Float     @default(0)    // 平均耗时（秒）

  // 自我优化触发
  rejectStreak  Int       @default(0)    // 连续被打回次数
  lastRejectAt  DateTime?

  // 优化状态
  optimizationStatus String @default("NORMAL") // NORMAL, PENDING, OPTIMIZING, OPTIMIZED
  optimizationLog    Json?  // 优化日志

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([agentType, projectId])
  @@index([agentType])
}

// 自我优化触发规则
const OPTIMIZATION_TRIGGERS = {
  rejectStreakThreshold: 3,      // 连续3次被打回
  rejectRateThreshold: 0.3,      // 30% 打回率
  errorCountThreshold: 5         // 5次错误触发
}
```

### 数据库模型设计

```prisma
// 0. Project - 项目（新增）
model Project {
  id            String    @id @default(uuid())
  userId        String
  name          String
  description   String?

  // 项目配置
  agentTeam     Json?     // 项目专属的虚拟员工团队配置

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // 关联
  sessions      Session[]
  performances  AgentPerformance[]

  @@index([userId])
}

// 1. AgentProfile - 员工档案（扁平化角色）
model AgentProfile {
  id              String    @id @default(uuid())
  type            String    @unique  // secretary, specialist, tool
  name            String
  role            String    // secretary, specialist, tool

  // 身份设定
  corePrompt      String    @db.Text     // 核心身份设定
  decisionLogic   String    @db.Text     // CoA 决策逻辑

  // 能力配置
  maxConcurrentTasks Int   @default(3)   // 最大并行任务数
  timeout            Int   @default(300) // 超时时间（秒）
  retryCount         Int   @default(3)   // 重试次数

  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // 关联
  skills        AgentSkillBinding[]
  instances     AgentInstance[]
  performances  AgentPerformance[]
}

// 2. SkillProfile - 技能档案
model SkillProfile {
  id                 String    @id @default(uuid())
  type               String    @unique
  name               String
  description        String?

  // 技能工作方式
  skillPrompt        String    @db.Text  // 技能执行提示词
  chainOfThought     String    @db.Text  // 思维链

  // 工具定义（简单工作可创建为工具）
  isTool             Boolean   @default(false)
  toolDefinition     Json?     // { name, description, parameters, handler }

  // 执行配置
  dependsOn          String[]  // 依赖链
  order              Int       @default(0)
  defaultAcceptanceCriteria Json?  // 默认验收标准

  // 工作流配置
  workflowConfig     Json?     // { parallel, timeout, retry }

  // 配套工具
  requiredTools      Json?     // MCP/Tools/API 配置

  isActive           Boolean   @default(true)

  bindings           AgentSkillBinding[]
}

// 3. AgentSkillBinding - Agent-Skill 关联
model AgentSkillBinding {
  id          String       @id @default(uuid())
  agentType   String
  skillId     String
  config      Json?        // { priority, enabled, customPrompt }

  agent       AgentProfile @relation(fields: [agentType], references: [type])
  skill       SkillProfile @relation(fields: [skillId], references: [id])

  @@unique([agentType, skillId])
}

// 4. Session - 会话
model Session {
  id            String    @id @default(uuid())
  projectId     String    // 所属项目
  userId        String
  title         String?

  // 当前负责的 Secretary Agent
  secretaryType String    @default("secretary")

  // 会话状态
  status        String    @default("ACTIVE") // ACTIVE, PAUSED, COMPLETED

  // 上下文摘要（用于长会话压缩）
  contextSummary String?  @db.Text

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // 关联
  project       Project   @relation(fields: [projectId], references: [id])
  instances     AgentInstance[]
  tasks         Task[]
  contexts      Context[]
  products      WorkProduct[]

  @@index([projectId])
  @@index([userId])
  @@index([status])
}

// 5. AgentInstance - Agent 运行实例（扁平化）
model AgentInstance {
  id            String    @id @default(uuid())
  agentType     String    // secretary, specialist, tool
  sessionId     String

  // 扁平化：只保留 role，不再有层级关系
  role          String    // secretary, specialist, tool

  // 状态
  status        String    @default("IDLE") // IDLE, RUNNING, WAITING, COMPLETED

  // 运行时上下文
  context       Json?     // 记忆、偏好、临时状态

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // 关联
  session       Session   @relation(fields: [sessionId], references: [id])
  tasks         Task[]

  @@index([sessionId])
  @@index([agentType])
}

// 6. Task - 任务
model Task {
  id            String    @id @default(uuid())
  sessionId     String
  agentInstanceId String?  // 执行此任务的 Agent

  // 任务定义
  name          String
  description   String?
  payload       Json?     // 任务输入数据

  // 任务分析（新增）
  inputType     String?   // QUESTION, REQUIREMENT, EXECUTION
  complexity    String?   // SIMPLE, MEDIUM, COMPLEX

  // 执行模式
  executionMode String    @default("SERIAL") // SERIAL, PARALLEL, HYBRID
  status        String    @default("PENDING") // PENDING, RUNNING, WAITING, COMPLETED, FAILED, CANCELLED, REJECTED

  // 验收标准
  acceptanceCriteria Json?  // { criteria: [], threshold: 0.8 }

  // 结果
  result        Json?     // 任务产出
  error         String?   // 错误信息

  // 时间戳
  createdAt     DateTime  @default(now())
  startedAt     DateTime?
  completedAt   DateTime?

  // 关联
  session       Session       @relation(fields: [sessionId], references: [id])
  agentInstance AgentInstance? @relation(fields: [agentInstanceId], references: [id])
  dependencies  TaskDependency[] @relation("DependentTask")
  dependents    TaskDependency[] @relation("DependencyTask")
  products      WorkProduct[]

  @@index([sessionId])
  @@index([status])
}

// 7. TaskDependency - 任务依赖关系
model TaskDependency {
  id             String    @id @default(uuid())
  taskId         String    // 依赖其他任务的任务
  dependsOnId    String    // 被依赖的任务

  task           Task      @relation("DependentTask", fields: [taskId], references: [id])
  dependsOn      Task      @relation("DependencyTask", fields: [dependsOnId], references: [id])

  @@unique([taskId, dependsOnId])
}

// 8. Context - 上下文记录
model Context {
  id            String    @id @default(uuid())
  sessionId     String

  // 来源
  role          String    // user, assistant, agent, system
  sourceAgent   String?   // 产生此上下文的 Agent 类型

  // 内容
  content       String    @db.Text
  metadata      Json?     // { toolCalls: [], tokens: 123, inputType, complexity }

  // 关联产物
  productId     String?   // 关联的工作产出

  createdAt     DateTime  @default(now())

  // 关联
  session       Session   @relation(fields: [sessionId], references: [id])
  product       WorkProduct? @relation(fields: [productId], references: [id])

  @@index([sessionId])
  @@index([createdAt])
}

// 9. WorkProduct - 工作产出物
model WorkProduct {
  id            String    @id @default(uuid())
  sessionId     String
  taskId        String?
  agentType     String    // 产生此产出的 Agent 类型

  // 产出类型
  type          String    // text, code, file, image, video, data
  name          String
  content       String?   @db.Text  // 小内容直接存
  storageKey    String?   // 大内容存 OSS/S3

  // 元数据
  metadata      Json?

  // 验收状态
  acceptanceStatus String? // PENDING, APPROVED, REJECTED
  acceptanceNote   String?

  createdAt     DateTime  @default(now())

  // 关联
  session       Session   @relation(fields: [sessionId], references: [id])
  task          Task?     @relation(fields: [taskId], references: [id])
  contexts      Context[]

  @@index([sessionId])
  @@index([type])
}

// 10. DomainKnowledge - 领域知识
model DomainKnowledge {
  id            String    @id @default(uuid())
  domain        String    @unique
  name          String
  description   String?

  knowledge     String    @db.Text
  analysis      String?   @db.Text
  status        String    @default("PENDING")

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([domain])
}

// 11. VirtualEmployeeTemplate - 虚拟职员模板
model VirtualEmployeeTemplate {
  id            String    @id @default(uuid())
  agentType     String    @unique

  name          String
  role          String
  description   String?

  corePrompt    String    @db.Text
  decisionLogic String    @db.Text
  skills        Json?

  maxConcurrentTasks Int  @default(3)
  timeout            Int  @default(300)
  retryCount         Int  @default(3)

  isActive      Boolean   @default(true)

  @@index([role])
}
```

### 核心流程设计

#### 1. 用户输入分类处理流程

```
用户发送消息
    │
    ▼
Secretary 分析输入内容
    │
    ├── 问题类 (QUESTION)
    │   ├── 识别问题意图
    │   ├── 调用工具/搜索/查库
    │   └── 总结回答用户
    │
    ├── 需求类 (REQUIREMENT)
    │   ├── 提取需求要素
    │   ├── 多轮沟通确认
    │   ├── 生成需求文档
    │   └── 等待用户最终确认
    │       ├── 确认通过 → 转为执行类
    │       └── 反馈修改 → 继续沟通
    │
    └── 执行类 (EXECUTION)
        ├── 分析任务复杂度
        ├── 决定工作方式
        └── 调度执行
```

#### 2. 任务复杂度评估 + 工作方式决策

```
分析任务
    │
    ├── 范围小、依赖少、不确定低 → SIMPLE
    │   └── 直接执行，不拆分，不过度思考
    │
    ├── 中等复杂度 → MEDIUM
    │   └── 轻度拆分，适度CoT，串行/并行混合
    │
    └── 高复杂度 → COMPLEX
        └── 完整CoT，深度拆分，DAG执行
```

#### 3. 数字员工考核 + 自我优化流程

```
任务完成/失败/被打回
    │
    ▼
更新 AgentPerformance 记录
    │
    ├── 任务成功 → successCount++
    ├── 任务失败 → failCount++
    └── 被打回 → rejectCount++, rejectStreak++
    │
    ▼
检查触发条件
    │
    ├── rejectStreak >= 3
    │   或 rejectRate >= 30%
    │   或 errorCount >= 5
    │   │
    │   ▼
    │   触发自我优化策略
    │   │
    │   ├── 分析错误模式
    │   ├── 生成优化建议
    │   ├── 更新 corePrompt / skillPrompt
    │   └── 记录优化日志
    │
    └── 正常 → 无需处理
```

#### 4. 会话创建流程（项目制）

```
用户选择/创建项目
    │
    ▼
在项目中创建新会话
    │
    ▼
自动分配 Secretary Agent
    │
    ▼
创建 Session + AgentInstance
    │
    ▼
用户开始对话
```

### UI 设计

#### 布局结构（简化版）

```
┌────────────────────────────────────────────────────────────┐
│  项目列表  │           聊天区域                     │  产物  │
│  ─────────│──────────────────────────────────────│────────│
│           │  消息列表                              │        │
│  项目A    │  ┌────────────────────────────────┐  │  卡片1 │
│  ├─会话1  │  │ 用户消息                        │  │  卡片2 │
│  ├─会话2  │  └────────────────────────────────┘  │  卡片3 │
│  │        │  ┌────────────────────────────────┐  │        │
│  项目B    │  │ Agent 回复（带进度/结果）       │  │        │
│  └─会话3  │  └────────────────────────────────┘  │        │
│           │                                       │        │
│           │  ┌────────────────────────────────┐  │        │
│           │  │ 输入框                          │  │        │
│           │  └────────────────────────────────┘  │        │
└───────────┴──────────────────────────────────────┴────────┘
```

#### 移除的内容
- Task List 独立侧边栏
- 复杂的任务状态面板
- 项目概念相关的复杂管理 UI

#### 保留/简化的内容
- 消息列表（核心）
- 产物面板（可折叠）
- 任务进度在消息流中展示（简化版）

### 关键技术实现

#### 1. Secretary Agent 核心逻辑

```typescript
interface ISecretaryAgent {
  // 1. 用户输入分类
  classifyInput(userMessage: string): Promise<InputClassification>

  // 2. 需求沟通（多轮）
  refineRequirement(sessionId: string, userFeedback: string): Promise<void>

  // 3. 任务复杂度评估
  assessComplexity(task: Task): Promise<TaskComplexity>

  // 4. 工作方式决策
  decideWorkStyle(complexity: TaskComplexity): WorkStyle

  // 5. 任务规划（支持 DAG）
  planTasks(requirement: string, complexity: TaskComplexity): Promise<Task[]>

  // 6. 执行调度
  scheduleExecution(dag: DAG): Promise<void>

  // 7. 绩效考核更新
  updatePerformance(agentType: string, result: TaskResult): Promise<void>

  // 8. 自我优化触发
  triggerOptimization(agentType: string): Promise<OptimizationResult>
}
```

#### 2. 自我优化引擎

```typescript
interface ISelfOptimizationEngine {
  // 分析失败模式
  analyzeFailurePattern(agentType: string): Promise<FailureAnalysis>

  // 生成优化建议
  generateOptimizationSuggestions(analysis: FailureAnalysis): Promise<OptimizationPlan>

  // 执行优化
  executeOptimization(plan: OptimizationPlan): Promise<void>

  // 验证优化效果
  verifyOptimization(agentType: string): Promise<boolean>
}
```

#### 3. 输入分类器（简单实现）

```typescript
// 基于规则 + LLM 的混合分类器
const classifyUserInput = async (message: string): Promise<InputClassification> => {
  // 1. 规则快速判断
  const questionPatterns = [/^(什么是|如何|怎么|怎样|为什么|哪里)/, /\?$/]
  const requirementPatterns = [/帮我|帮我做|我要|需要你|请帮我/]
  const executionPatterns = [/去执行|开始做|立即完成|生成/]

  if (questionPatterns.some(p => p.test(message))) {
    return { type: 'QUESTION', confidence: 0.8, reasoning: '疑问句式', suggestedAction: 'search_and_answer' }
  }
  if (requirementPatterns.some(p => p.test(message))) {
    return { type: 'REQUIREMENT', confidence: 0.7, reasoning: '需求表达', suggestedAction: 'gather_requirements' }
  }
  if (executionPatterns.some(p => p.test(message))) {
    return { type: 'EXECUTION', confidence: 0.9, reasoning: '执行指令', suggestedAction: 'execute_directly' }
  }

  // 2. LLM 深度判断（规则无法确定时）
  return await llmClassify(message)
}
```

---

## 关键文件修改

### 新增文件

| 文件 | 说明 |
|------|------|
| `server/src/agents/classifier/input-classifier.ts` | 用户输入分类器 |
| `server/src/agents/optimizer/self-optimizer.ts` | 自我优化引擎 |
| `server/src/services/performance.service.ts` | 绩效考核服务 |
| `server/src/services/project.service.ts` | 项目管理服务 |
| `client/src/components/Project/ProjectList.tsx` | 项目列表组件 |
| `client/src/components/Project/ProjectPanel.tsx` | 项目面板组件 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `server/prisma/schema.prisma` | 添加 Project、AgentPerformance、Task.inputType/complexity |
| `server/src/agents/secretary/secretary.agent.ts` | 整合输入分类、复杂度评估、自我优化 |
| `server/src/agents/engine/agent.engine.ts` | 添加项目支持 |
| `server/src/services/websocket.service.ts` | 添加项目相关消息 |
| `client/src/App.tsx` | 重构布局，移除 Task 侧边栏，添加项目面板 |
| `client/src/components/Chat/ChatPanel.tsx` | 简化任务进度展示 |
| `client/src/types/index.ts` | 添加项目类型、输入分类类型 |

---

## 验收标准

1. **用户输入分类**
   - Secretary 能正确分类：问题类、需求类、执行类
   - 分类置信度展示

2. **任务复杂度评估**
   - 能准确评估 SIMPLE/MEDIUM/COMPLEX
   - 根据复杂度决定工作方式

3. **数字员工考核**
   - 记录每个 Agent 的成功/失败/被打回次数
   - 触发自我优化时能正确执行

4. **项目制管理**
   - 用户可以创建/选择项目
   - 项目下可以有多个会话

5. **UI 简化**
   - 移除 Task List 侧边栏
   - 任务进度在消息流中展示
   - 产物面板保留

6. **上下文持久化**
   - 所有沟通记录存入 Context 表
   - 工作产出存入 WorkProduct 表

7. **数据库驱动**
   - 所有 Agent/Skill 配置从数据库读取
   - 无硬编码