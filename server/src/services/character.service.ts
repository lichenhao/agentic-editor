/**
 * Character Service - 角色管理服务
 * 负责角色设定数据库持久化，确保跨章节一致性
 */

import { prisma } from '../infrastructure/storage/storage'

export interface CharacterInput {
  projectId: string
  name: string
  age?: number
  gender?: string
  appearance: string
  personality: string[]
  role: string  // 主角/配角/反派/酱油/龙套
  relationships?: Array<{ targetId: string; type: string; description?: string }>
  imageUrl?: string
  prompt?: string
}

export interface CharacterOutput {
  id: string
  projectId: string
  name: string
  age?: number
  gender?: string
  appearance: string
  personality: string[]
  role: string
  relationships?: Array<{ targetId: string; type: string; description?: string }>
  imageUrl?: string
  prompt?: string
  createdAt: Date
  updatedAt: Date
}

export class CharacterService {

  /**
   * 创建角色
   */
  async createCharacter(input: CharacterInput): Promise<CharacterOutput> {
    const character = await prisma.character.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        age: input.age,
        gender: input.gender,
        appearance: input.appearance,
        personality: input.personality,
        role: input.role,
        relationships: input.relationships || [],
        imageUrl: input.imageUrl,
        prompt: input.prompt
      }
    })

    return this.toOutput(character)
  }

  /**
   * 批量创建角色
   */
  async createCharacters(projectId: string, characters: Omit<CharacterInput, 'projectId'>[]): Promise<CharacterOutput[]> {
    const created = await Promise.all(
      characters.map(char => this.createCharacter({
        projectId,
        ...char
      }))
    )

    return created
  }

  /**
   * 获取项目的所有角色
   */
  async getProjectCharacters(projectId: string): Promise<CharacterOutput[]> {
    const characters = await prisma.character.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    })

    return characters.map(c => this.toOutput(c))
  }

  /**
   * 获取单个角色
   */
  async getCharacter(characterId: string): Promise<CharacterOutput | null> {
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    return character ? this.toOutput(character) : null
  }

  /**
   * 更新角色
   */
  async updateCharacter(characterId: string, input: Partial<CharacterInput>): Promise<CharacterOutput> {
    const character = await prisma.character.update({
      where: { id: characterId },
      data: {
        ...input,
        relationships: input.relationships
      }
    })

    return this.toOutput(character)
  }

  /**
   * 更新角色外观（图片生成后更新）
   */
  async updateCharacterImage(characterId: string, imageUrl: string, prompt?: string): Promise<CharacterOutput> {
    return this.updateCharacter(characterId, { imageUrl, prompt })
  }

  /**
   * 删除角色
   */
  async deleteCharacter(characterId: string): Promise<void> {
    await prisma.character.delete({
      where: { id: characterId }
    })
  }

  /**
   * 检查角色是否存在（用于一致性检查）
   */
  async checkCharacterExists(projectId: string, name: string): Promise<CharacterOutput | null> {
    const character = await prisma.character.findFirst({
      where: {
        projectId,
        name
      }
    })

    return character ? this.toOutput(character) : null
  }

  /**
   * 获取所有主角
   */
  async getMainCharacters(projectId: string): Promise<CharacterOutput[]> {
    const characters = await prisma.character.findMany({
      where: {
        projectId,
        role: '主角'
      }
    })

    return characters.map(c => this.toOutput(c))
  }

  /**
   * 生成角色列表摘要（用于 Agent 上下文）
   */
  async getCharacterSummary(projectId: string): Promise<string> {
    const characters = await this.getProjectCharacters(projectId)

    if (characters.length === 0) {
      return '尚未创建任何角色'
    }

    const summary = characters.map(char => {
      return `【${char.role}】${char.name}
- 年龄: ${char.age || '未知'}
- 性别: ${char.gender || '未知'}
- 外貌: ${char.appearance}
- 性格: ${char.personality.join('、')}
${char.relationships?.length ? `- 关系: ${char.relationships.map(r => `${r.type}${r.description || ''}`).join('，')}` : ''}`
    }).join('\n\n')

    return summary
  }

  /**
   * 转换为输出格式
   */
  private toOutput(character: any): CharacterOutput {
    return {
      id: character.id,
      projectId: character.projectId,
      name: character.name,
      age: character.age,
      gender: character.gender,
      appearance: character.appearance,
      personality: character.personality || [],
      role: character.role,
      relationships: character.relationships || [],
      imageUrl: character.imageUrl,
      prompt: character.prompt,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt
    }
  }
}

export const characterService = new CharacterService()