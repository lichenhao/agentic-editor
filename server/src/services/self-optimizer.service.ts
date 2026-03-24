import { prisma } from '../infrastructure/database/prisma'
import { performanceService } from './performance.service'

// 失败分析结果
export interface FailureAnalysis {
  agentType: string
  projectId: string | null
  failurePatterns: string[]
  rootCauses: string[]
  suggestedChanges: OptimizationSuggestion[]
}

// 优化建议
export interface OptimizationSuggestion {
  type: 'PROMPT' | 'SKILL' | 'WORKFLOW' | 'TOOL'
  description: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

// 优化计划
export interface OptimizationPlan {
  agentType: string
  projectId: string | null
  analysis: FailureAnalysis
  changes: PlannedChange[]
}

// 计划变更
export interface PlannedChange {
  target: string  // corePrompt, skillPrompt, decisionLogic 等
  oldValue: string
  newValue: string
  reason: string
}

/**
 * 自我优化引擎
 */
export class SelfOptimizer {
  /**
   * 分析失败模式
   */
  async analyzeFailurePattern(
    agentType: string,
    projectId: string | null
  ): Promise<FailureAnalysis> {
    const performance = await performanceService.getPerformance(agentType, projectId)

    if (!performance) {
      return {
        agentType,
        projectId,
        failurePatterns: [],
        rootCauses: [],
        suggestedChanges: [],
      }
    }

    // 分析失败模式
    const failurePatterns: string[] = []
    const rootCauses: string[] = []
    const suggestedChanges: OptimizationSuggestion[] = []

    // 模式1: 高打回率
    if (performance.totalTasks > 0) {
      const rejectRate = performance.rejectCount / performance.totalTasks
      if (rejectRate > 0.3) {
        failurePatterns.push(`打回率过高: ${(rejectRate * 100).toFixed(1)}%`)
        rootCauses.push('Agent 产出不符合用户预期')
        suggestedChanges.push({
          type: 'PROMPT',
          description: '强化验收标准描述，使 Agent 更清楚用户期望',
          priority: 'HIGH',
        })
      }
    }

    // 模式2: 连续打回
    if (performance.rejectStreak >= 3) {
      failurePatterns.push(`连续打回: ${performance.rejectStreak}次`)
      rootCauses.push('Agent 无法从反馈中学习')
      suggestedChanges.push({
        type: 'WORKFLOW',
        description: '增加反馈理解步骤，确保 Agent 正确理解用户意见',
        priority: 'HIGH',
      })
    }

    // 模式3: 高失败率
    if (performance.totalTasks > 0) {
      const failRate = performance.failCount / performance.totalTasks
      if (failRate > 0.2) {
        failurePatterns.push(`失败率过高: ${(failRate * 100).toFixed(1)}%`)
        rootCauses.push('Agent 能力不足或任务过于复杂')
        suggestedChanges.push({
          type: 'SKILL',
          description: '增加相关技能培训或工具支持',
          priority: 'MEDIUM',
        })
      }
    }

    return {
      agentType,
      projectId,
      failurePatterns,
      rootCauses,
      suggestedChanges,
    }
  }

  /**
   * 生成优化建议
   */
  async generateOptimizationSuggestions(
    analysis: FailureAnalysis
  ): Promise<OptimizationPlan> {
    const changes: PlannedChange[] = []

    // 获取当前 Agent 配置
    const agent = await prisma.agentProfile.findUnique({
      where: { type: analysis.agentType },
    })

    if (!agent) {
      return {
        agentType: analysis.agentType,
        projectId: analysis.projectId,
        analysis,
        changes,
      }
    }

    // 根据分析结果生成变更建议
    for (const suggestion of analysis.suggestedChanges) {
      if (suggestion.type === 'PROMPT') {
        // 优化核心提示词
        const newCorePrompt = this.enhanceCorePrompt(agent.corePrompt, analysis)
        if (newCorePrompt !== agent.corePrompt) {
          changes.push({
            target: 'corePrompt',
            oldValue: agent.corePrompt,
            newValue: newCorePrompt,
            reason: suggestion.description,
          })
        }
      }

      if (suggestion.type === 'WORKFLOW') {
        // 优化决策逻辑
        const newDecisionLogic = this.enhanceDecisionLogic(agent.decisionLogic, analysis)
        if (newDecisionLogic !== agent.decisionLogic) {
          changes.push({
            target: 'decisionLogic',
            oldValue: agent.decisionLogic,
            newValue: newDecisionLogic,
            reason: suggestion.description,
          })
        }
      }
    }

    return {
      agentType: analysis.agentType,
      projectId: analysis.projectId,
      analysis,
      changes,
    }
  }

  /**
   * 执行优化
   */
  async executeOptimization(plan: OptimizationPlan): Promise<void> {
    if (plan.changes.length === 0) {
      console.log('[SelfOptimizer] No changes to apply')
      return
    }

    console.log(`[SelfOptimizer] Executing optimization for ${plan.agentType}`)
    console.log(`[SelfOptimizer] Changes: ${plan.changes.length}`)

    // 更新 Agent 配置
    const updateData: any = {}

    for (const change of plan.changes) {
      updateData[change.target] = change.newValue
    }

    await prisma.agentProfile.update({
      where: { type: plan.agentType },
      data: updateData,
    })

    // 更新优化状态
    const performance = await performanceService.getPerformance(
      plan.agentType,
      plan.projectId
    )

    if (performance) {
      await prisma.agentPerformance.update({
        where: { id: performance.id },
        data: {
          optimizationStatus: 'OPTIMIZED',
          optimizationLog: {
            ...performance.optimizationLog,
            optimizedAt: new Date().toISOString(),
            changes: plan.changes,
          },
        },
      })
    }

    console.log(`[SelfOptimizer] Optimization completed for ${plan.agentType}`)
  }

  /**
   * 验证优化效果
   */
  async verifyOptimization(agentType: string, projectId: string | null): Promise<boolean> {
    const performance = await performanceService.getPerformance(agentType, projectId)

    if (!performance) {
      return false
    }

    // 检查优化后是否有所改善
    // 这里可以设置具体的验证标准
    return performance.optimizationStatus === 'OPTIMIZED'
  }

  /**
   * 增强核心提示词
   */
  private enhanceCorePrompt(currentPrompt: string, analysis: FailureAnalysis): string {
    let enhanced = currentPrompt

    // 添加验收标准强化
    if (analysis.failurePatterns.some(p => p.includes('打回'))) {
      const reinforcement = `

## 验收标准强化
- 在产出任何内容前，先明确用户期望的验收标准
- 如果不确定验收标准，主动询问用户确认
- 产出后主动检查是否符合常见验收标准
- 认真对待用户反馈，从中学习改进`
      enhanced += reinforcement
    }

    return enhanced
  }

  /**
   * 增强决策逻辑
   */
  private enhanceDecisionLogic(currentLogic: string, analysis: FailureAnalysis): string {
    let enhanced = currentLogic

    // 添加反馈理解步骤
    if (analysis.failurePatterns.some(p => p.includes('连续打回'))) {
      const reinforcement = `

## 反馈理解强化
当收到用户反馈或打回时：
1. 仔细阅读反馈内容，确保完全理解
2. 分析反馈的具体问题点
3. 制定改进方案
4. 在改进时避免引入新的问题
5. 如果对反馈有疑问，主动询问用户澄清`
      enhanced += reinforcement
    }

    return enhanced
  }
}

// 导出单例
export const selfOptimizer = new SelfOptimizer()