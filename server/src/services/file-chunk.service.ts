/**
 * File Chunk Service - 文件智能分片服务
 * 上传文件时自动拆分章节段落，支持大文件上下文管理
 */

import { prisma } from '../infrastructure/storage/storage'
import { storageService } from '../infrastructure/storage/storage'

// 分片配置
const CHUNK_CONFIG = {
  maxCharsPerChunk: 8000,    // 每个分片最大字符数
  minCharsPerChunk: 2000,   // 最小字符数（避免过短）
  maxTokensEstimate: 2000   // 预估最大token数
}

// 章节识别模式
const CHAPTER_PATTERNS = [
  /^(第[一二三四五六七八九十百千\d]+[章卷篇部])\s*(.+)/,           // 第X章
  /^(Chapter\s*\d+)\s*[:\-]?\s*(.+)/i,                              // Chapter X
  /^(第[一二三四五六七八九十百千\d]+[节部])/i,                      // 第X节
  /^【(.+)】/,                                                       // 【标题】
  /^(#{1,6})\s+(.+)/,                                               // Markdown标题
  /^(\d+\.)\s+(.+)/,                                                // 1. 标题
]

interface ChunkResult {
  fileId: string
  chunks: Array<{
    chunkIndex: number
    chapterId: string | null
    chapterTitle: string | null
    sectionTitle: string | null
    level: number
    content: string
    charCount: number
    tokenEstimate: number
    startOffset: number
    endOffset: number
  }>
}

export class FileChunkService {

  /**
   * 对上传文件进行智能分片（同步版本，直接接收文件内容）
   */
  async chunkFileWithContent(fileId: string, content: string): Promise<ChunkResult> {
    console.log(`[FileChunk] Chunking file: ${fileId}, content length: ${content.length}`)

    // 智能分片
    const chunks = this.splitContent(content)
    console.log(`[FileChunk] Split into ${chunks.length} chunks`)

    // 保存分片到数据库
    const savedChunks = await this.saveChunks(fileId, chunks)

    return {
      fileId,
      chunks: savedChunks
    }
  }

  /**
   * 对上传文件进行智能分片（从存储加载）
   */
  async chunkFile(fileId: string): Promise<ChunkResult> {
    console.log(`[FileChunk] Starting chunking for file: ${fileId}`)

    // 获取文件信息
    const file = await prisma.uploadedFile.findUnique({
      where: { id: fileId }
    })

    if (!file) {
      throw new Error(`File not found: ${fileId}`)
    }

    // 读取文件内容
    const content = await this.loadFileContent(file.storageKey)
    console.log(`[FileChunk] File loaded, size: ${content.length} chars`)

    // 智能分片
    const chunks = this.splitContent(content)
    console.log(`[FileChunk] Split into ${chunks.length} chunks`)

    // 保存分片到数据库
    const savedChunks = await this.saveChunks(fileId, chunks)

    return {
      fileId,
      chunks: savedChunks
    }
  }

  /**
   * 从存储加载文件内容
   */
  private async loadFileContent(storageKey: string): Promise<string> {
    try {
      const result = await storageService.download(storageKey)
      if (!result) {
        throw new Error('File not found in storage')
      }
      // 解码 base64 内容
      return Buffer.from(result.data, 'base64').toString('utf-8')
    } catch (error) {
      console.error('[FileChunk] Failed to load file:', error)
      throw new Error('无法读取文件内容')
    }
  }

  /**
   * 智能分片内容
   */
  private splitContent(content: string): Array<any> {
    const chunks: Array<any> = []
    let currentChapter = { id: null as string | null, title: null as string | null, level: 1 }
    let offset = 0

    // 按行分割处理
    const lines = content.split('\n')
    let currentChunk = ''
    let chunkStartOffset = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineLength = line.length + 1 // 包含换行符

      // 检测章节标题
      const chapterMatch = this.detectChapter(line)
      if (chapterMatch) {
        // 保存当前章节的最后一个块
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(
            chunks.length,
            currentChapter,
            currentChunk,
            chunkStartOffset,
            offset
          ))
          currentChunk = ''
        }

        // 更新章节信息
        currentChapter = {
          id: `chapter_${chunks.length}`,
          title: chapterMatch.title,
          level: chapterMatch.level
        }
        chunkStartOffset = offset
      }

      // 检查是否需要新建分片
      if (currentChunk.length + lineLength > CHUNK_CONFIG.maxCharsPerChunk) {
        // 当前块已满，保存
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(
            chunks.length,
            currentChapter,
            currentChunk,
            chunkStartOffset,
            offset
          ))
        }
        // 开始新块
        currentChunk = line + '\n'
        chunkStartOffset = offset
      } else {
        currentChunk += line + '\n'
      }

      offset += lineLength
    }

    // 保存最后一个块
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        chunks.length,
        currentChapter,
        currentChunk,
        chunkStartOffset,
        offset
      ))
    }

    return chunks
  }

  /**
   * 检测章节标题
   */
  private detectChapter(line: string): { title: string; level: number } | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    for (const pattern of CHAPTER_PATTERNS) {
      const match = trimmed.match(pattern)
      if (match) {
        return {
          title: match[2] || match[1],
          level: match[1]?.length || 1
        }
      }
    }

    return null
  }

  /**
   * 创建分片对象
   */
  private createChunk(
    index: number,
    chapter: { id: string | null; title: string | null; level: number },
    content: string,
    startOffset: number,
    endOffset: number
  ) {
    const charCount = content.length
    // 简单估算：中文约1.5 token/字符，英文约4 token/字符
    const tokenEstimate = Math.ceil(charCount / 3)

    return {
      chunkIndex: index,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      sectionTitle: null,
      level: chapter.level,
      content,
      charCount,
      tokenEstimate,
      startOffset,
      endOffset
    }
  }

  /**
   * 保存分片到数据库
   */
  private async saveChunks(
    fileId: string,
    chunks: Array<any>
  ): Promise<Array<any>> {
    const savedChunks = []

    for (const chunk of chunks) {
      const saved = await prisma.fileChunk.create({
        data: {
          fileId,
          chunkIndex: chunk.chunkIndex,
          chapterId: chunk.chapterId,
          chapterTitle: chunk.chapterTitle,
          sectionTitle: chunk.sectionTitle,
          level: chunk.level,
          content: chunk.content,
          charCount: chunk.charCount,
          tokenEstimate: chunk.tokenEstimate,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset
        }
      })
      savedChunks.push(saved)
    }

    return savedChunks
  }

  /**
   * 读取指定分片 - Agent 工具调用
   * @param fileId 文件ID
   * @param chunkIndices 分片索引数组，如 [0, 1, 2] 或 "0-5" 范围
   * @param chapterId 章节ID（可选）
   */
  async readChunks(
    fileId: string,
    chunkIndices?: number[],
    chapterId?: string
  ): Promise<{ chunks: any[]; totalChunks: number }> {
    console.log(`[FileChunk] Reading chunks for file: ${fileId}, indices: ${JSON.stringify(chunkIndices)}, chapter: ${chapterId}`)

    const where: any = { fileId }

    if (chapterId) {
      where.chapterId = chapterId
    } else if (chunkIndices && chunkIndices.length > 0) {
      where.chunkIndex = { in: chunkIndices }
    }

    const chunks = await prisma.fileChunk.findMany({
      where,
      orderBy: { chunkIndex: 'asc' }
    })

    const totalChunks = await prisma.fileChunk.count({ where: { fileId } })

    return { chunks, totalChunks }
  }

  /**
   * 获取文件分片摘要
   */
  async getFileChunksSummary(fileId: string): Promise<{
    totalChunks: number
    chapters: Array<{ id: string; title: string; chunkCount: number }>
  }> {
    const chunks = await prisma.fileChunk.findMany({
      where: { fileId },
      select: { chapterId: true, chapterTitle: true, chunkIndex: true }
    })

    const chapterMap = new Map<string, { title: string; count: number }>()
    let totalChunks = 0

    for (const chunk of chunks) {
      totalChunks++
      if (chunk.chapterId) {
        const existing = chapterMap.get(chunk.chapterId)
        if (existing) {
          existing.count++
        } else {
          chapterMap.set(chunk.chapterId, {
            title: chunk.chapterTitle || '未命名章节',
            count: 1
          })
        }
      }
    }

    const chapters = Array.from(chapterMap.entries()).map(([id, data]) => ({
      id,
      title: data.title,
      chunkCount: data.count
    }))

    return { totalChunks, chapters }
  }

  /**
   * 根据关键词搜索分片
   */
  async searchChunks(fileId: string, keyword: string): Promise<any[]> {
    const chunks = await prisma.fileChunk.findMany({
      where: {
        fileId,
        content: { contains: keyword }
      },
      orderBy: { chunkIndex: 'asc' },
      take: 5 // 最多返回5个相关分片
    })

    return chunks
  }
}

export const fileChunkService = new FileChunkService()