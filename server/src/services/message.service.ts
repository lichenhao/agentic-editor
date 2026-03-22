import { prisma } from '../infrastructure/database/prisma'

// 序列号缓存（内存中，用于同一毫秒内的递增）
const sequenceCache = new Map<string, { timestamp: number; seq: number }>()

// 消息类型定义
export interface CreateMessageParams {
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  employeeId?: string  // 消息所属 Agent/职员 ID
  toolCalls?: any
  attachments?: any
}

// 获取下一个序列号（同一毫秒内递增）
function getNextSequence(sessionId: string): number {
  const now = Date.now()
  const cached = sequenceCache.get(sessionId)

  if (cached && cached.timestamp === now) {
    cached.seq += 1
    return cached.seq
  } else {
    sequenceCache.set(sessionId, { timestamp: now, seq: 0 })
    return 0
  }
}

// 创建消息（确保时序）
export async function createMessage(params: CreateMessageParams) {
  const now = new Date()
  // 使用时间戳 + 序列号确保唯一和时序（移除随机数）
  const latestTimestamp = await getLatestMessageTimestamp(params.sessionId)
  const sequence = getNextSequence(params.sessionId)
  // 如果是同一毫秒内，sequence 会递增；否则重置为 0
  const isSameMs = latestTimestamp.getTime() === now.getTime()
  const order = BigInt(now.getTime()) * BigInt(1000) + BigInt(isSameMs ? sequence : 0)

  const message = await prisma.context.create({
    data: {
      sessionId: params.sessionId,
      employeeId: params.employeeId,
      role: params.role,
      content: params.content,
      toolCalls: params.toolCalls,
      attachments: params.attachments,
      createdAt: now,
      order
    }
  })

  return message
}

// 根据 sessionId 获取消息列表（确保时序）
export async function getMessagesBySession(sessionId: string, limit = 100, offset = 0) {
  const messages = await prisma.context.findMany({
    where: { sessionId },
    orderBy: [
      { createdAt: 'asc' },
      { order: 'asc' },
      { id: 'asc' }
    ],
    take: limit,
    skip: offset
  })

  return messages
}

// 获取会话的最新消息时间戳（用于计算 order）
export async function getLatestMessageTimestamp(sessionId: string) {
  const latest = await prisma.context.findFirst({
    where: { sessionId },
    orderBy: { createdAt: 'desc' }
  })

  return latest?.createdAt || new Date(0)
}

// 批量创建消息（原子操作）
export async function createMessages(messages: CreateMessageParams[]) {
  const now = new Date()
  let baseOrder = BigInt(now.getTime()) * BigInt(1000)

  const data = messages.map((msg, index) => ({
    sessionId: msg.sessionId,
    employeeId: msg.employeeId,
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls,
    attachments: msg.attachments,
    createdAt: now,
    order: baseOrder + BigInt(index)
  }))

  const result = await prisma.context.createMany({
    data
  })

  return result
}

// 根据 ID 获取消息
export async function getMessageById(id: string) {
  return await prisma.context.findUnique({
    where: { id }
  })
}

// 更新消息内容
export async function updateMessageContent(id: string, content: string) {
  return await prisma.context.update({
    where: { id },
    data: { content }
  })
}

// 删除消息
export async function deleteMessage(id: string) {
  return await prisma.context.delete({
    where: { id }
  })
}

// 清空会话消息
export async function clearSessionMessages(sessionId: string) {
  return await prisma.context.deleteMany({
    where: { sessionId }
  })
}