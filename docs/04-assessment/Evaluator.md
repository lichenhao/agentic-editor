# 测评 Agent 设计

## 1. 概述

测评 Agent 是一个特殊的 Agent，用于自动评估其他 Agent 的产出质量，并提供改进建议。

## 2. 职责

- 分析 Agent 产出质量
- 识别问题和优点
- 生成改进建议
- 触发自我迭代

## 3. LangGraph 状态机

```typescript
interface EvaluatorState {
  taskId: string;
  agentId: string;
  output: string;
  userFeedback?: string;
  analysis?: QualityAnalysis;
  suggestions?: ImprovementSuggestion[];
}

const evaluatorGraph = new StateGraph<EvaluatorState>()
  .addNode('analyze', analyzeQualityNode)
  .addNode('suggest', generateSuggestionsNode)
  .addNode('decide', decideActionNode)
  .addNode('log', logResultNode)
  .addEdge('analyze', 'suggest')
  .addEdge('suggest', 'decide')
  .addEdge('decide', 'log')
  .compile();
```

## 4. 节点实现

### 4.1 质量分析节点

```typescript
async function analyzeQualityNode(state: EvaluatorState) {
  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });

  const response = await llm.invoke(`
    <role>你是一个质量评估专家</role>
    <task>分析以下 Agent 产出质量</task>

    <output>
    ${state.output}
    </output>

    <user_feedback>
    ${state.userFeedback || '无'}
    </user_feedback>

    请返回 JSON：
    {
      "score": 1-5,
      "issues": ["问题1", "问题2"],
      "strengths": ["优点1"],
      "reasoning": "评估理由"
    }
  `);

  return { analysis: JSON.parse(response.content) };
}
```

### 4.2 建议生成节点

```typescript
async function generateSuggestionsNode(state: EvaluatorState) {
  if (state.analysis.score >= 4) {
    return { suggestions: [] }; // 质量良好，无需建议
  }

  const llm = new Anthropic({ model: 'claude-sonnet-4-6' });

  const response = await llm.invoke(`
    <role>你是一个优化顾问</role>
    <task>根据质量问题生成改进建议</task>

    <issues>
    ${state.analysis.issues.join('\n')}
    </issues>

    请返回 JSON：
    {
      "suggestions": [
        {
          "type": "prompt_improvement/config_adjustment/tool_change",
          "description": "建议描述",
          "priority": "high/medium/low"
        }
      ]
    }
  `);

  return { suggestions: JSON.parse(response.content).suggestions };
}
```

### 4.3 决策节点

```typescript
async function decideActionNode(state: EvaluatorState) {
  const suggestions = state.suggestions || [];

  // 决定触发哪种迭代
  let action: 'none' | 'light' | 'medium' | 'heavy' = 'none';

  if (state.analysis.score < 2 && suggestions.length > 2) {
    action = 'heavy';
  } else if (state.analysis.score < 3) {
    action = 'medium';
  } else if (suggestions.length > 0) {
    action = 'light';
  }

  // 触发迭代
  if (action !== 'none') {
    await this.selfIterationManager.trigger({
      agentId: state.agentId,
      triggerType: 'evaluator_recommendation',
      severity: action,
      suggestions
    });
  }

  return { suggestedAction: action };
}
```

## 5. 与考核系统集成

```typescript
class AssessmentService {
  async assess(taskId: string): Promise<AssessmentResult> {
    const task = await this.taskRepo.findById(taskId);
    const agent = await this.agentRepo.findById(task.agentId);

    // 调用测评 Agent
    const evaluator = new EvaluatorAgent();
    const evaluation = await evaluator.evaluate(
      taskId,
      agent.id,
      task.output,
      task.userFeedback
    );

    // 记录考核结果
    await this.assessmentRepo.create({
      taskId,
      agentId: agent.id,
      ...evaluation
    });

    // 更新 Agent 指标
    await this.agentRepo.updateMetrics(agent.id, {
      lastScore: evaluation.score,
      consecutiveRejections: evaluation.score < 3
        ? (agent.metrics.consecutiveRejections || 0) + 1
        : 0
    });

    return evaluation;
  }
}
```

## 6. 相关文档

- [考核系统设计](./README.md)
- [自我迭代设计](./SelfIteration.md)
- [经验知识库设计](./KnowledgeBase.md)
- 总体架构：[../01-arch/README.md](../01-arch/README.md)