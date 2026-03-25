# Skill 引擎详细设计

## 1. 概述

Skill 引擎支持用户通过自然语言即时创建新的 Agent 类型（Spec-Skills），并动态注册到系统中。

## 2. 架构

```
┌─────────────────────────────────────────────────────────┐
│                    Skill Engine                          │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ SkillCreator │  │ SkillRegistry│  │ SkillExecutor│  │
│  │ (对话式创建)  │  │ (注册表)     │  │ (执行器)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Database                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ skills table                                      │  │
│  │ id, tenant_id, name, description, prompt_template│  │
│  │ tools, created_by, created_at                    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 3. 数据模型

```typescript
interface Skill {
  id: string;
  tenantId: string;
  name: string;           // kebab-case
  description: string;
  promptTemplate: string;
  tools: string[];
  capabilities: string[];
  createdBy: string;
  version: number;
  status: 'active' | 'deprecated';
  createdAt: Date;
  updatedAt: Date;
}
```

```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  tools TEXT,                      -- JSON array
  capabilities TEXT,               -- JSON array
  created_by UUID REFERENCES users(id),
  version INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 4. 对话式创建流程

### 4.1 流程图

```
用户: "我需要一个能帮我分析数据的 Skill"
       │
       ▼
SkillCreator.analyze()
       │
       ▼
LLM 提取 Skill 规范
       │
       ▼
生成 prompt_template
       │
       ▼
SkillRegistry.register()
       │
       ▼
返回 Skill 给用户
```

### 4.2 实现

```typescript
class SkillCreator {
  constructor(
    private llm: Anthropic,
    private skillRepo: SkillRepository
  ) {}

  async createFromNaturalLanguage(userPrompt: string, tenantId: string): Promise<Skill> {
    // 1. 使用 LLM 分析用户需求
    const spec = await this.extractSkillSpec(userPrompt);

    // 2. 生成 prompt_template
    const promptTemplate = await this.generatePromptTemplate(spec);

    // 3. 确定所需工具
    const tools = await this.suggestTools(spec);

    // 4. 创建 Skill
    const skill: Skill = {
      id: generateId(),
      tenantId,
      name: spec.name,
      description: spec.description,
      promptTemplate,
      tools,
      capabilities: spec.capabilities,
      createdBy: 'system',
      version: 1,
      status: 'active'
    };

    await this.skillRepo.create(skill);

    return skill;
  }

  private async extractSkillSpec(prompt: string): Promise<SkillSpec> {
    const response = await this.llm.invoke(`
      分析以下需求，提取 Skill 定义：
      ${prompt}

      返回 JSON 格式：
      {
        "name": "skill-名称（kebab-case，英文）",
        "description": "技能描述（中文）",
        "capabilities": ["能力1", "能力2"],
        "input_format": "输入格式描述",
        "output_format": "输出格式描述"
      }
    `);

    return JSON.parse(response.content);
  }

  private async generatePromptTemplate(spec: SkillSpec): Promise<string> {
    const response = await this.llm.invoke(`
      为以下 Skill 生成系统提示词模板：

      名称: ${spec.name}
      描述: ${spec.description}
      能力: ${spec.capabilities.join(', '))}
      输入格式: ${spec.input_format}
      输出格式: ${spec.output_format}

      要求：
      1. 清晰地定义 Skill 的角色和能力
      2. 指定输入输出格式
      3. 包含处理逻辑指导
    `);

    return response.content;
  }

  private async suggestTools(spec: SkillSpec): Promise<string[]> {
    const response = await this.llm.invoke(`
      根据以下 Skill 能力，推荐需要使用的工具：

      能力: ${spec.capabilities.join(', ')}

      可用工具列表：
      - file_read: 读取文件
      - file_write: 写入文件
      - search: 搜索信息
      - code_execute: 执行代码
      - data_analysis: 数据分析
      - web_fetch: 获取网页内容

      返回 JSON 数组：
      ["tool1", "tool2"]
    `);

    return JSON.parse(response.content);
  }
}
```

## 5. Skill 注册表

```typescript
class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  async load(tenantId: string): Promise<void> {
    if (this.loaded) return;

    const skills = await this.skillRepo.findActive(tenantId);
    for (const skill of skills) {
      this.skills.set(skill.id, skill);
    }
    this.loaded = true;
  }

  async refresh(tenantId: string): Promise<void> {
    this.loaded = false;
    this.skills.clear();
    await this.load(tenantId);
  }

  get(name: string): Skill | undefined {
    return Array.from(this.skills.values()).find(s => s.name === name);
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }
}
```

## 6. Skill 执行器

```typescript
class SkillExecutor {
  async execute(skillId: string, input: string, context: ExecutionContext): Promise<ExecutionResult> {
    const skill = await this.skillRegistry.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // 注入 prompt_template 到 LLM
    const llm = new Anthropic({
      model: 'claude-sonnet-4-6',
      system: skill.promptTemplate
    });

    // 执行
    const startTime = Date.now();
    const response = await llm.invoke(input);

    return {
      output: response.content,
      tokenUsed: response.usage.input_tokens + response.usage.output_tokens,
      duration: Date.now() - startTime
    };
  }
}
```

## 7. 与 Supervisor 集成

```typescript
// Supervisor Agent 中使用 Skill
async function createSubAgentsNode(state: SupervisorState) {
  // 检查任务是否需要特定 Skill
  for (const task of state.decomposedTasks || []) {
    if (task.requiresSkill) {
      // 动态加载或创建 Skill
      let skill = await this.skillRegistry.get(task.skillName);

      if (!skill && task.createSkillIfMissing) {
        // 对话式创建 Skill
        skill = await this.skillCreator.createFromNaturalLanguage(
          task.skillDescription,
          state.tenantId
        );
      }

      // 使用 Skill 创建 Agent
      const agent = await this.agentFactory.createFromSkill(skill);
    }
  }
}
```

## 8. 相关文档

- [Agent 核心设计](./README.md)
- [Supervisor 详细设计](./Supervisor.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)