/**
 * AgentProfile Loader - 从数据库加载 Agent 主设定
 * 双层架构：AgentProfile（通用能力）+ ProjectAgent（项目专属配置）
 */

import { prisma } from '../../infrastructure/database/prisma'

// 缓存
const profileCache = new Map<string, any>()
const profileSkillsCache = new Map<string, any[]>()

export class AgentProfileLoader {
  /**
   * 加载单个 Agent 主设定
   */
  static async loadProfile(type: string): Promise<any | null> {
    // 检查缓存
    if (profileCache.has(type)) {
      return profileCache.get(type)
    }

    // 从数据库加载
    const profile = await prisma.agentProfile.findUnique({
      where: { type, isActive: true },
      include: {
        skillBindings: {
          include: {
            skill: true
          }
        }
      }
    })

    if (profile) {
      profileCache.set(type, profile)
    }

    return profile
  }

  /**
   * 加载所有活跃的 Agent 主设定
   */
  static async loadAllProfiles(): Promise<any[]> {
    return prisma.agentProfile.findMany({
      where: { isActive: true },
      include: {
        skillBindings: {
          include: {
            skill: true
          }
        }
      },
      orderBy: { level: 'asc' }
    })
  }

  /**
   * 获取 Agent 及其绑定的 Skills
   */
  static async getProfileWithSkills(type: string): Promise<any | null> {
    // 检查缓存
    if (profileSkillsCache.has(type)) {
      return profileSkillsCache.get(type)
    }

    const profile = await this.loadProfile(type)
    if (!profile) return null

    // 获取绑定的 skills
    const bindings = await prisma.agentSkillBinding.findMany({
      where: { agentType: type },
      include: { skill: true },
      orderBy: { skill: { order: 'asc' } }
    })

    const result = {
      ...profile,
      skills: bindings.map(b => ({
        ...b.skill,
        bindingConfig: b.config
      }))
    }

    profileSkillsCache.set(type, result)
    return result
  }

  /**
   * 创建新的 Agent 主设定
   */
  static async createProfile(data: {
    type: string
    name: string
    role: string
    description?: string
    corePrompt: string
    decisionLogic: string
    level?: number
    parentType?: string
  }): Promise<any> {
    const profile = await prisma.agentProfile.create({
      data: {
        type: data.type,
        name: data.name,
        role: data.role,
        description: data.description,
        corePrompt: data.corePrompt,
        decisionLogic: data.decisionLogic,
        level: data.level ?? 1,
        parentType: data.parentType,
        isActive: true
      }
    })

    // 清除缓存
    profileCache.clear()
    profileSkillsCache.clear()

    return profile
  }

  /**
   * 更新 Agent 主设定
   */
  static async updateProfile(type: string, data: {
    name?: string
    role?: string
    description?: string
    corePrompt?: string
    decisionLogic?: string
    level?: number
    isActive?: boolean
  }): Promise<any> {
    const profile = await prisma.agentProfile.update({
      where: { type },
      data
    })

    // 清除缓存
    profileCache.delete(type)
    profileSkillsCache.delete(type)

    return profile
  }

  /**
   * 删除 Agent 主设定（软删除）
   */
  static async deleteProfile(type: string): Promise<void> {
    await prisma.agentProfile.update({
      where: { type },
      data: { isActive: false }
    })

    // 清除缓存
    profileCache.delete(type)
    profileSkillsCache.delete(type)
  }

  /**
   * 绑定 Skill 到 Agent
   */
  static async bindSkill(agentType: string, skillId: string, config?: any): Promise<any> {
    return prisma.agentSkillBinding.upsert({
      where: { agentType_skillId: { agentType, skillId } },
      create: { agentType, skillId, config },
      update: { config }
    })
  }

  /**
   * 解除 Skill 绑定
   */
  static async unbindSkill(agentType: string, skillId: string): Promise<void> {
    await prisma.agentSkillBinding.delete({
      where: { agentType_skillId: { agentType, skillId } }
    })
  }

  /**
   * 清除所有缓存
   */
  static clearCache(): void {
    profileCache.clear()
    profileSkillsCache.clear()
  }
}