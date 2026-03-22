/**
 * Career Manager Agent（职业经理人 Agent）
 * 一人公司工作室模式：项目创建时分配专属的职业经理人
 * 负责：工作定性定调、校准工作流、生成验收标准、反馈用户确认
 */

import { prisma } from '../../infrastructure/database/prisma'
import { AgentProfileLoader } from '../loader/agent-profile.loader'
import { SkillLoader } from '../loader/skill.loader'
import { ProjectAgentService } from '../service/project-agent.service'
import { ResponseBuilder } from '../service/response-builder.service'
import type { AgentContext, AgentResult, Task } from '../base/agent.interface'
import type { AgentResponse } from '../base/response.interface'

export class CareerManagerAgent {
  type = 'career_manager'
  projectId: string
  userId: string

  constructor(projectId: string, userId: string) {
    this.projectId = projectId
    this.userId = userId
  }

  /**
   * 主执行流程：分析工作 → 校准工作流 → 生成验收标准 → 反馈确认
   */
  async execute(): Promise<AgentResponse> {
    try {
      // 1. 加载项目信息
      const project = await prisma.project.findUnique({
        where: { id: this.projectId }
      })

      if (!project) {
        return ResponseBuilder.error('项目不存在', 'PROJECT_NOT_FOUND')
      }

      // 2. 加载或创建 ProjectAgent（职业经理人绑定）
      let projectAgent = await ProjectAgentService.getProjectAgent(this.projectId)

      if (!projectAgent) {
        // 分配职业经理人
        projectAgent = await ProjectAgentService.assignAgent(this.projectId, this.type)
      }

      // 3. 加载 Agent 主设定
      const profile = await AgentProfileLoader.getProfileWithSkills(this.type)

      if (!profile) {
        return ResponseBuilder.error(
          '职业经理人配置不存在，请先在数据库中配置 AgentProfile',
          'AGENT_NOT_FOUND'
        )
      }

      // 4. 分析工作性质（根据项目内容）
      const workAnalysis = await this.analyzeWork(project)

      // 5. 校准工作流（如果未校准）
      if (projectAgent.status === 'IDLE' || projectAgent.status === 'CALIBRATED') {
        await this.calibrateWorkflow(workAnalysis)
      }

      // 6. 生成验收标准
      const acceptanceCriteria = await this.generateAcceptanceCriteria(workAnalysis)

      // 7. 返回确认表单
      return this.buildConfirmationResponse(workAnalysis, acceptanceCriteria)

    } catch (error: any) {
      console.error('[CareerManager] Execute error:', error)
      return ResponseBuilder.error(
        error.message || '执行失败',
        'EXECUTE_ERROR',
        error
      )
    }
  }

  /**
   * 分析工作性质
   */
  private async analyzeWork(project: any): Promise<any> {
    // 根据项目内容分析工作类型
    const novelText = project.novelText
    const genre = project.genre

    // 简单分析：基于是否有小说内容和项目类型
    let workType = 'general'
    let workDescription = ''

    if (novelText && novelText.length > 0) {
      workType = 'novel_to_video'
      workDescription = '将小说改编为短剧视频'
    }

    if (genre) {
      workDescription += `，题材：${genre}`
    }

    return {
      type: workType,
      description: workDescription,
      projectName: project.name,
      hasContent: !!novelText,
      genre: genre || '未指定'
    }
  }

  /**
   * 校准工作流
   */
  private async calibrateWorkflow(workAnalysis: any): Promise<void> {
    // 根据工作类型生成工作流
    let workflow: any[] = []
    let calibrationPrompt = ''

    switch (workAnalysis.type) {
      case 'novel_to_video':
        workflow = [
          { id: 'chunking', name: '小说分片', order: 1 },
          { id: 'analysis', name: '剧本分析', order: 2, requireApproval: true },
          { id: 'asset_generation', name: '视觉资产生成', order: 3, requireApproval: true },
          { id: 'storyboard', name: '分镜生成', order: 4, requireApproval: true },
          { id: 'video_generation', name: '视频生成', order: 5 },
          { id: 'editing', name: '智能剪辑', order: 6 }
        ]
        calibrationPrompt = '小说转短剧工作流：从分片到最终成片的完整流程'
        break
      default:
        workflow = [
          { id: 'analysis', name: '分析', order: 1 },
          { id: 'execution', name: '执行', order: 2 }
        ]
        calibrationPrompt = '通用工作流'
    }

    // 更新 ProjectAgent
    await ProjectAgentService.calibrate(this.projectId, this.type, {
      calibrationPrompt,
      workflow
    })
  }

  /**
   * 生成验收标准
   */
  private async generateAcceptanceCriteria(workAnalysis: any): Promise<any> {
    const criteria: any = {
      project: {
        name: workAnalysis.projectName,
        type: workAnalysis.type,
        description: workAnalysis.description
      },
      stages: []
    }

    // 根据工作类型生成阶段验收标准
    switch (workAnalysis.type) {
      case 'novel_to_video':
        criteria.stages = [
          {
            id: 'chunking',
            name: '小说分片',
            criteria: [
              '章节划分合理，保留情节完整性',
              '每个分片不超过 8000 字符',
              '正确识别章节标题'
            ]
          },
          {
            id: 'analysis',
            name: '剧本分析',
            criteria: [
              '完整提取所有角色信息',
              '准确识别叙事节拍',
              '场景描述清晰'
            ],
            requiresApproval: true
          },
          {
            id: 'asset_generation',
            name: '视觉资产生成',
            criteria: [
              '角色外观描述一致',
              '场景氛围符合剧情',
              '视觉风格统一'
            ],
            requiresApproval: true
          },
          {
            id: 'storyboard',
            name: '分镜生成',
            criteria: [
              '镜头拆分合理',
              '对话与动作匹配',
              '时长控制合理'
            ],
            requiresApproval: true
          },
          {
            id: 'video_generation',
            name: '视频生成',
            criteria: [
              '画面质量清晰',
              '口型同步准确',
              '转场流畅'
            ]
          },
          {
            id: 'editing',
            name: '智能剪辑',
            criteria: [
              '片段衔接自然',
              '节奏得当',
              '成片可发布'
            ]
          }
        ]
        break
      default:
        criteria.stages = [
          {
            id: 'analysis',
            name: '分析',
            criteria: ['准确理解需求', '方案合理']
          },
          {
            id: 'execution',
            name: '执行',
            criteria: ['按时完成', '质量达标']
          }
        ]
    }

    return criteria
  }

  /**
   * 构建确认响应
   */
  private buildConfirmationResponse(workAnalysis: any, criteria: any): AgentResponse {
    // 构建工作流摘要
    const workflowSummary = criteria.stages.map((stage: any) =>
      `${stage.order || ''}. ${stage.name}${stage.requiresApproval ? ' ✓' : ''}`
    ).join('\n')

    const content = `## 工作分析确认

**项目类型**: ${workAnalysis.type}
**项目名称**: ${workAnalysis.projectName}
**工作描述**: ${workAnalysis.description}

### 工作流程
${workflowSummary}

### 验收标准
每个阶段完成后将按照上述标准进行验收，标记 ✓ 的阶段需要您确认后方可进入下一阶段。

**请确认以上工作流程和验收标准是否符合您的预期？**`

    return ResponseBuilder.confirmation(
      content,
      {
        type: 'form',
        content: {
          projectType: workAnalysis.type,
          workflow: criteria.stages,
          criteria: criteria.stages
        }
      },
      {
        actions: ['开始执行', '修改流程', '取消']
      }
    )
  }

  /**
   * 获取当前工作流状态
   */
  async getWorkflowStatus(): Promise<AgentResponse> {
    const projectAgent = await ProjectAgentService.getProjectAgent(this.projectId, this.type)

    if (!projectAgent) {
      return ResponseBuilder.error('未分配职业经理人', 'NO_AGENT')
    }

    const workflow = projectAgent.workflow as any[] || []
    const status = projectAgent.status

    return ResponseBuilder.message(
      `当前工作流状态: ${status}`,
      { type: 'list', content: workflow }
    )
  }
}

export const careerManagerAgent = CareerManagerAgent