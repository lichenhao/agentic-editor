import { prisma } from '../infrastructure/database/prisma'

// 优化触发阈值配置
export const OPTIMIZATION_TRIGGERS = {
  rejectStreakThreshold: 3,    // 连续3次被打回
  rejectRateThreshold: 0.3,    // 30% 打回率
  errorCountThreshold: 5,      // 5次错误触发
}

// 任务结果类型
export type TaskResultType = 'SUCCESS' | 'FAILURE' | 'REJECTED'

/**
 * 数字员工绩效考核服务
 */
export class PerformanceService {
  /**
   * 记录任务结果
   */
  async recordTaskResult(
    agentType: string,
    projectId: string | null,
    resultType: TaskResultType,
    durationSeconds: number
  ): Promise<void> {
    const performance = await this.getOrCreatePerformance(agentType, projectId)

    // 更新统计数据
    const updateData: any = {
      totalTasks: { increment: 1 },
      avgDuration: this.calculateNewAvg(
        performance.avgDuration,
        performance.totalTasks,
        durationSeconds
      ),
    }

    // 根据结果类型更新
    switch (resultType) {
      case 'SUCCESS':
        updateData.successCount = { increment: 1 }
        updateData.rejectStreak = 0 // 成功后重置连续打回计数
        break
      case 'FAILURE':
        updateData.failCount = { increment: 1 }
        updateData.rejectStreak = 0
        break
      case 'REJECTED':
        updateData.rejectCount = { increment: 1 }
        updateData.rejectStreak = { increment: 1 }
        updateData.lastRejectAt = new Date()
        break
    }

    await prisma.agentPerformance.update({
      where: { id: performance.id },
      data: updateData,
    })

    // 检查是否触发优化
    await this.checkAndTriggerOptimization(agentType, projectId)
  }

  /**
   * 获取或创建绩效记录
   */
  async getOrCreatePerformance(
    agentType: string,
    projectId: string | null
  ): Promise<any> {
    let performance = await prisma.agentPerformance.findUnique({
      where: {
        agentType_projectId: { agentType, projectId },
      },
    })

    if (!performance) {
      performance = await prisma.agentPerformance.create({
        data: {
          agentType,
          projectId,
        },
      })
    }

    return performance
  }

  /**
   * 获取绩效记录
   */
  async getPerformance(
    agentType: string,
    projectId: string | null
  ): Promise<any | null> {
    return await prisma.agentPerformance.findUnique({
      where: {
        agentType_projectId: { agentType, projectId },
      },
    })
  }

  /**
   * 计算新的平均值
   */
  private calculateNewAvg(
    currentAvg: number,
    currentCount: number,
    newValue: number
  ): number {
    const total = currentAvg * currentCount + newValue
    return total / (currentCount + 1)
  }

  /**
   * 检查是否触发自我优化
   */
  private async checkAndTriggerOptimization(
    agentType: string,
    projectId: string | null
  ): Promise<void> {
    const performance = await this.getPerformance(agentType, projectId)
    if (!performance) return

    // 检查优化状态
    if (performance.optimizationStatus !== 'NORMAL') {
      return // 已在优化中
    }

    const { rejectStreakThreshold, rejectRateThreshold } = OPTIMIZATION_TRIGGERS

    // 检查连续打回
    if (performance.rejectStreak >= rejectStreakThreshold) {
      await this.triggerOptimization(agentType, projectId, 'REJECT_STREAK')
      return
    }

    // 检查打回率
    if (performance.totalTasks > 0) {
      const rejectRate = performance.rejectCount / performance.totalTasks
      if (rejectRate >= rejectRateThreshold) {
        await this.triggerOptimization(agentType, projectId, 'REJECT_RATE')
        return
      }
    }
  }

  /**
   * 触发自我优化
   */
  async triggerOptimization(
    agentType: string,
    projectId: string | null,
    reason: string
  ): Promise<void> {
    console.log(`[PerformanceService] Triggering optimization for ${agentType}, reason: ${reason}`)

    // 更新优化状态
    await prisma.agentPerformance.update({
      where: {
        agentType_projectId: { agentType, projectId },
      },
      data: {
        optimizationStatus: 'PENDING',
        optimizationLog: {
          reason,
          triggeredAt: new Date().toISOString(),
        },
      },
    })

    // TODO: 触发自我优化引擎
    // 这部分会在 self-optimizer.ts 中实现
  }

  /**
   * 获取所有 Agent 绩效统计
   */
  async getAllPerformances(projectId?: string): Promise<any[]> {
    return await prisma.agentPerformance.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { totalTasks: 'desc' },
    })
  }
}

// 导出单例
export const performanceService = new PerformanceService()