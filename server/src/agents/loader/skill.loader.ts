/**
 * Skill Loader - 从数据库加载 Skill 技能设定
 * SkillProfile: 能力单元，可被多个 Agent 复用
 */

import { prisma } from '../../infrastructure/database/prisma'

// 缓存
const skillCache = new Map<string, any>()
const skillAllCache: any[] | null = null

export class SkillLoader {
  /**
   * 加载单个 Skill
   */
  static async loadSkill(type: string): Promise<any | null> {
    // 检查缓存
    if (skillCache.has(type)) {
      return skillCache.get(type)
    }

    const skill = await prisma.skillProfile.findUnique({
      where: { type, isActive: true }
    })

    if (skill) {
      skillCache.set(type, skill)
    }

    return skill
  }

  /**
   * 加载所有活跃的 Skills
   */
  static async loadAllSkills(): Promise<any[]> {
    return prisma.skillProfile.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    })
  }

  /**
   * 为指定 Agent 加载 Skills
   */
  static async loadSkillsForAgent(agentType: string): Promise<any[]> {
    const bindings = await prisma.agentSkillBinding.findMany({
      where: { agentType },
      include: { skill: true },
      orderBy: { skill: { order: 'asc' } }
    })

    return bindings.map(b => ({
      ...b.skill,
      bindingConfig: b.config
    }))
  }

  /**
   * 加载 Skill 依赖链（按执行顺序）
   */
  static async loadSkillChain(agentType: string): Promise<any[]> {
    const skills = await this.loadSkillsForAgent(agentType)

    // 按依赖排序
    const sorted: any[] = []
    const visited = new Set<string>()

    const visit = (skillType: string) => {
      if (visited.has(skillType)) return
      visited.add(skillType)

      const skill = skills.find(s => s.type === skillType)
      if (!skill) return

      // 先访问依赖
      if (skill.dependsOn) {
        for (const dep of skill.dependsOn) {
          visit(dep)
        }
      }

      sorted.push(skill)
    }

    // 从第一个 skill 开始
    if (skills.length > 0) {
      visit(skills[0].type)
    }

    // 添加未访问的
    for (const skill of skills) {
      visit(skill.type)
    }

    return sorted
  }

  /**
   * 创建新的 Skill
   */
  static async createSkill(data: {
    type: string
    name: string
    description?: string
    skillPrompt: string
    chainOfThought: string
    isTool?: boolean
    toolDefinition?: any
    dependsOn?: string[]
    order?: number
    defaultAcceptanceCriteria?: any
    config?: any
  }): Promise<any> {
    const skill = await prisma.skillProfile.create({
      data: {
        type: data.type,
        name: data.name,
        description: data.description,
        skillPrompt: data.skillPrompt,
        chainOfThought: data.chainOfThought,
        isTool: data.isTool ?? false,
        toolDefinition: data.toolDefinition,
        dependsOn: data.dependsOn ?? [],
        order: data.order ?? 0,
        defaultAcceptanceCriteria: data.defaultAcceptanceCriteria,
        config: data.config,
        isActive: true
      }
    })

    // 清除缓存
    skillCache.clear()

    return skill
  }

  /**
   * 更新 Skill
   */
  static async updateSkill(type: string, data: {
    name?: string
    description?: string
    skillPrompt?: string
    chainOfThought?: string
    isTool?: boolean
    toolDefinition?: any
    dependsOn?: string[]
    order?: number
    defaultAcceptanceCriteria?: any
    config?: any
    isActive?: boolean
  }): Promise<any> {
    const skill = await prisma.skillProfile.update({
      where: { type },
      data
    })

    // 清除缓存
    skillCache.delete(type)

    return skill
  }

  /**
   * 删除 Skill（软删除）
   */
  static async deleteSkill(type: string): Promise<void> {
    await prisma.skillProfile.update({
      where: { type },
      data: { isActive: false }
    })

    // 清除缓存
    skillCache.delete(type)
  }

  /**
   * 清除所有缓存
   */
  static clearCache(): void {
    skillCache.clear()
  }
}