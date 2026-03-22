/**
 * Skills Registry - Agent 和 Skill 注册表
 * 从数据库动态加载配置，移除硬编码
 */

import { prisma } from '../../infrastructure/database/prisma'

interface SkillDefinition {
  id: string
  name: string
  description: string
  version: string
  prompt?: string
  tools?: string[]
  chainOfThought?: string
  isTool?: boolean
  requireApproval?: boolean
}

interface AgentDefinition {
  id: string
  name: string
  description: string
  level: number
  version?: string
  systemPrompt?: string
  skills?: string[]
}

export class SkillsRegistry {
  private skills: Map<string, SkillDefinition[]> = new Map()
  private agents: Map<string, AgentDefinition[]> = new Map()
  private initialized = false

  async loadSkills(skillsPath?: string) {
    console.log('[SkillsRegistry] Loading from database...')

    // 从数据库加载（不再使用硬编码）
    await this.loadFromDatabase()

    this.initialized = true
    console.log('[SkillsRegistry] Loaded', this.agents.size, 'agents and', this.skills.size, 'skills')
  }

  /**
   * 从数据库加载 Agent 和 Skill 配置
   */
  private async loadFromDatabase() {
    try {
      // 加载 AgentProfile（主设定）
      const profiles = await prisma.agentProfile.findMany({
        where: { isActive: true },
        include: {
          skillBindings: {
            include: { skill: true }
          }
        }
      })

      for (const profile of profiles) {
        const agentDef: AgentDefinition = {
          id: profile.type,
          name: profile.name,
          description: profile.description || '',
          level: profile.level,
          systemPrompt: profile.corePrompt,
          skills: profile.skillBindings.map(b => b.skill.type)
        }
        this.agents.set(agentDef.id, [agentDef])
      }

      // 加载 SkillProfile（技能设定）
      const skills = await prisma.skillProfile.findMany({
        where: { isActive: true }
      })

      for (const skill of skills) {
        const skillDef: SkillDefinition = {
          id: skill.type,
          name: skill.name,
          description: skill.description || '',
          version: '1.0.0',
          prompt: skill.skillPrompt,
          chainOfThought: skill.chainOfThought,
          isTool: skill.isTool,
          requireApproval: skill.defaultAcceptanceCriteria ? true : false
        }
        this.skills.set(skillDef.id, [skillDef])
      }

      console.log('[SkillsRegistry] Loaded from database:', this.agents.size, 'agents,', this.skills.size, 'skills')
    } catch (error) {
      console.error('[SkillsRegistry] Failed to load from database:', error)
      // 如果数据库加载失败，使用空映射
      this.agents = new Map()
      this.skills = new Map()
    }
  }

  /**
   * 重新加载（刷新缓存）
   */
  async reload() {
    this.agents.clear()
    this.skills.clear()
    await this.loadFromDatabase()
  }

  getSkill(skillId: string, version?: string): SkillDefinition | undefined {
    const versions = this.skills.get(skillId)
    if (!versions) return undefined
    return version ? versions.find(v => v.version === version) : versions[versions.length - 1]
  }

  getAgent(agentId: string, version?: string): AgentDefinition | undefined {
    const versions = this.agents.get(agentId)
    if (!versions) return undefined
    return version ? versions.find(v => v.version === version) : versions[versions.length - 1]
  }

  listSkills(): SkillDefinition[] {
    const result: SkillDefinition[] = []
    for (const versions of this.skills.values()) {
      result.push(versions[versions.length - 1])
    }
    return result
  }

  listAgents(): AgentDefinition[] {
    const result: AgentDefinition[] = []
    for (const versions of this.agents.values()) {
      result.push(versions[versions.length - 1])
    }
    return result
  }
}

export const skillsRegistry = new SkillsRegistry()
