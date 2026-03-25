# PostgreSQL 表结构设计

## 1. 核心表

### 1.1 用户表

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  user_md TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
```

### 1.2 Agent 模板表

```sql
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  system_prompt TEXT NOT NULL,
  tools TEXT,
  capabilities TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  soul_md TEXT,
  agents_md TEXT,
  memory_md TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_templates_tenant ON agent_templates(tenant_id);
CREATE INDEX idx_templates_role ON agent_templates(role);
```

### 1.3 Agent 实例表

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID REFERENCES agent_templates(id),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  system_prompt TEXT NOT NULL,
  tools TEXT,
  status VARCHAR(50) DEFAULT 'active',
  version INTEGER DEFAULT 1,
  parent_agent_id UUID,
  metrics JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_agents_status ON agents(status);
```

### 1.4 Skill 表

```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  tools TEXT,
  capabilities TEXT,
  created_by UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_skills_tenant ON skills(tenant_id);
```

### 1.5 任务表

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  parent_task_id UUID,
  supervisor_id UUID REFERENCES agents(id),
  status VARCHAR(50) DEFAULT 'pending',
  input TEXT NOT NULL,
  output TEXT,
  decomposed_subtasks JSONB,
  thread_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
```

### 1.6 子任务表

```sql
CREATE TABLE task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  agent_id UUID REFERENCES agents(id),
  status VARCHAR(50) DEFAULT 'pending',
  name VARCHAR(255) NOT NULL,
  input TEXT,
  output TEXT,
  dependencies JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_subtasks_task ON task_subtasks(task_id);
```

### 1.7 考核记录表

```sql
CREATE TABLE assessment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  token_used INTEGER,
  duration_ms INTEGER,
  feedback_score INTEGER,
  feedback_text TEXT,
  calculated_score REAL,
  assessment_result VARCHAR(50),
  reasons JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assessment_agent ON assessment_records(agent_id);
CREATE INDEX idx_assessment_task ON assessment_records(task_id);
```

### 1.8 策略配置表

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policies_type ON policies(type);
CREATE INDEX idx_policies_tenant ON policies(tenant_id);
```

### 1.9 审批记录表

```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  subtask_id UUID REFERENCES task_subtasks(id),
  action VARCHAR(50) NOT NULL,
  approver_id UUID REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approvals_task ON approvals(task_id);
```

### 1.10 线程表

```sql
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255),
  context JSONB,
  context_tokens INTEGER DEFAULT 0,
  branch_root_id UUID,
  parent_branch_id UUID,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_threads_branch ON threads(branch_root_id);
```

### 1.11 迭代配置表

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
```

### 1.12 审计日志表

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at);
```

## 2. 多租户约束

所有表都包含 `tenant_id` 字段，查询时必须过滤：

```typescript
// ✅ 正确
const agents = await this.agentRepo.findBy({ tenantId });

// ❌ 禁止
const agents = await this.agentRepo.findAll();
```

## 3. 相关文档

- [数据层设计](./README.md)
- [Redis 数据结构](./Redis.md)
- [ClickHouse 时序表](./ClickHouse.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)