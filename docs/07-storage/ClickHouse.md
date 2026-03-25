# ClickHouse 时序表设计

## 1. 概述

ClickHouse 用于存储时序数据，支持高效的聚合查询和趋势分析。

## 2. 核心表

### 2.1 Agent 指标表

```sql
CREATE TABLE agent_metrics (
  tenant_id UUID,
  agent_id UUID,
  task_id UUID,
  token_used Int32,
  duration_ms Int32,
  score Float32,
  tool_call_count Int32,
  error_count Int32,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, agent_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;
```

### 2.2 工具调用表

```sql
CREATE TABLE tool_calls (
  tenant_id UUID,
  task_id UUID,
  agent_id UUID,
  tool_name String,
  success Boolean,
  token_used Int32,
  duration_ms Int32,
  error_message String,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, tool_name, timestamp)
TTL timestamp + INTERVAL 30 DAY;
```

### 2.3 失败案例表

```sql
CREATE TABLE failure_cases (
  tenant_id UUID,
  agent_id UUID,
  template_id UUID,
  task_input String,
  output String,
  failure_reason String,
  user_feedback String,
  score Float32,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, agent_id, timestamp)
TTL timestamp + INTERVAL 180 DAY;
```

### 2.4 优秀模板表

```sql
CREATE TABLE excellent_templates (
  tenant_id UUID,
  template_id UUID,
  role String,
  success_count Int32,
  avg_score Float32,
  config_snapshot JSON,
  first_used DateTime,
  last_used DateTime,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, template_id, timestamp);
```

## 3. 查询示例

### 3.1 Agent 质量趋势

```sql
SELECT
  toStartOfDay(timestamp) as day,
  avg(score) as avg_score,
  count() as task_count,
  sum(token_used) as total_tokens
FROM agent_metrics
WHERE agent_id = '{agentId}'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY day
ORDER BY day;
```

### 3.2 工具使用统计

```sql
SELECT
  tool_name,
  count() as call_count,
  sumIf(1, success) as success_count,
  avg(duration_ms) as avg_duration
FROM tool_calls
WHERE tenant_id = '{tenantId}'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY tool_name
ORDER BY call_count DESC;
```

### 3.3 失败案例分析

```sql
SELECT
  failure_reason,
  count() as count,
  avg(score) as avg_score
FROM failure_cases
WHERE agent_id = '{agentId}'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY failure_reason
ORDER BY count DESC
LIMIT 10;
```

## 4. 相关文档

- [数据层设计](./README.md)
- [PostgreSQL 表结构](./PostgreSQL.md)
- [Redis 数据结构](./Redis.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)