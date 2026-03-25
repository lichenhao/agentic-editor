# 经验知识库设计

## 1. 概述

经验知识库存储失败案例和优秀配置模板，供 Agent 学习和新 Agent 创建参考。

## 2. 数据模型 (ClickHouse)

```sql
-- 失败案例表
CREATE TABLE failure_cases (
  tenant_id UUID,
  agent_id UUID,
  template_id UUID,
  task_input TEXT,
  output TEXT,
  failure_reason TEXT,
  user_feedback TEXT,
  score Float32,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, agent_id, timestamp);

-- 优秀模板表
CREATE TABLE excellent_templates (
  tenant_id UUID,
  template_id UUID,
  role VARCHAR(50),
  success_count Int32,
  avg_score Float32,
  config_snapshot JSON,
  first_used DateTime,
  last_used DateTime,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, template_id, timestamp);
```

## 3. 核心接口

```typescript
interface KnowledgeBase {
  // 归档失败案例
  archiveFailure(agent: Agent): Promise<void>;

  // 获取优秀模板
  getExcellentTemplates(criteria: SearchCriteria): Promise<AgentTemplate[]>;

  // 检索失败经验
  searchFailures(query: string): Promise<FailureCase[]>;

  // 统计
  getStatistics(agentId: string): Promise<AgentStatistics>;
}
```

## 4. 实现

```typescript
class KnowledgeBaseImpl implements KnowledgeBase {
  private embeddingService: EmbeddingService;
  private clickHouse: ClickHouse;

  async archiveFailure(agent: Agent): Promise<void> {
    const history = await this.assessmentRepo.getHistory(agent.id);
    const failedTasks = history.filter(h => h.score < 3).slice(-10);

    if (failedTasks.length === 0) return;

    // 存储到 ClickHouse
    await this.clickHouse.insert('failure_cases', {
      tenant_id: agent.tenantId,
      agent_id: agent.id,
      template_id: agent.templateId,
      task_input: failedTasks.map(t => t.taskInput).join('\n---\n'),
      output: failedTasks.map(t => t.output).join('\n---\n'),
      failure_reason: failedTasks.map(t => t.failureReason).join('; '),
      user_feedback: failedTasks.map(t => t.userFeedback).join('; '),
      score: failedTasks.reduce((sum, t) => sum + t.score, 0) / failedTasks.length,
      timestamp: new Date()
    });

    // 生成向量嵌入（用于语义搜索）
    for (const task of failedTasks) {
      const embedding = await this.embeddingService.encode(task.taskInput);
      await this.vectorStore.upsert('failures', {
        id: task.id,
        vector: embedding,
        metadata: {
          agentId: agent.id,
          failureReason: task.failureReason
        }
      });
    }
  }

  async getExcellentTemplates(criteria: SearchCriteria): Promise<AgentTemplate[]> {
    const query = `
      SELECT
        template_id,
        argMax(config_snapshot, timestamp) as config,
        sum(success_count) as total_success,
        avg(avg_score) as avg_score
      FROM excellent_templates
      WHERE tenant_id = '${criteria.tenantId}'
        ${criteria.role ? `AND role = '${criteria.role}'` : ''}
        ${criteria.minScore ? `AND avg_score >= ${criteria.minScore}` : ''}
      GROUP BY template_id
      ORDER BY total_success DESC
      LIMIT ${criteria.limit || 10}
    `;

    return await this.clickHouse.query(query);
  }

  async searchFailures(query: string): Promise<FailureCase[]> {
    // 语义搜索
    const embedding = await this.embeddingService.encode(query);
    const results = await this.vectorStore.search('failures', embedding, {
      filter: { score: { $lt: 3 } },
      limit: 5
    });

    // 获取详细失败案例
    const caseIds = results.map(r => r.id);
    return await this.clickHouse.query(`
      SELECT * FROM failure_cases
      WHERE task_id IN (${caseIds.map(id => `'${id}'`).join(',')})
    `);
  }

  async getStatistics(agentId: string): Promise<AgentStatistics> {
    const query = `
      SELECT
        count() as total_tasks,
        avg(score) as avg_score,
        countIf(score >= 4) as excellent_count,
        countIf(score < 3) as failure_count
      FROM assessment_records
      WHERE agent_id = '${agentId}'
    `;

    const result = await this.clickHouse.query(query);
    return {
      totalTasks: result[0].total_tasks,
      avgScore: result[0].avg_score,
      excellentRate: result[0].excellent_count / result[0].total_tasks,
      failureRate: result[0].failure_count / result[0].total_tasks
    };
  }
}
```

## 5. 优秀模板更新

```typescript
class ExcellentTemplateUpdater {
  async update(templateId: string, assessment: Assessment): Promise<void> {
    if (assessment.score >= 4.5) {
      // 增加优秀计数
      await this.clickHouse.insert('excellent_templates', {
        tenant_id: assessment.tenantId,
        template_id: templateId,
        role: assessment.agentRole,
        success_count: 1,
        avg_score: assessment.score,
        config_snapshot: JSON.stringify(await this.getTemplateConfig(templateId)),
        first_used: new Date(),
        last_used: new Date()
      });
    }
  }
}
```

## 6. 相关文档

- [考核系统设计](./README.md)
- [自我迭代设计](./SelfIteration.md)
- [测评 Agent 设计](./Evaluator.md)
- 数据层：[../07-storage/ClickHouse.md](../07-storage/ClickHouse.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)