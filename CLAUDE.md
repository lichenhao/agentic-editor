# Agent 架构工作约束

## 核心原则

1. **禁止硬编码**：所有 Agents、Skills、Tools 定义必须从数据库读取，禁止在代码中硬编码
2. **双层架构**：每个 Agent 由主设定（身份、验收标准）和技能设定（工作方式）共同构成
3. **数据库优先**：涉及 Agent 定义的操作必须先查询数据库
4. **职业经理人模式**：主 Agent 会话创建时必须分析工作、生成验收标准、反馈用户确认

## 实现规范

- 新增 Agent 类型 → 数据库 AgentProfile 表
- 新增 Skill → 数据库 SkillProfile 表
- Agent 与 Skill 关联 → AgentSkillBinding 表
- 项目绑定 → ProjectAgent 表
- 虚拟职员模板 → VirtualEmployeeTemplate 表
- 用户偏好 → UserPreferenceModel 表

## 验证步骤

1. 代码中不得出现新的硬编码 Agent/Skill 定义
2. 所有 Agent 加载必须通过 AgentProfileLoader
3. 所有 Skill 加载必须通过 SkillLoader
4. 所有项目 Agent 绑定必须通过 ProjectAgentService