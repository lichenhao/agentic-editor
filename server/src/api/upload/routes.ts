import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { storageService } from '../../infrastructure/storage/storage'
import { prisma } from '../../infrastructure/storage/storage'
import { fileChunkService } from '../../services/file-chunk.service'
import crypto from 'crypto'

export async function uploadRoutes(fastify: FastifyInstance) {
  // Upload file
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file()
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' })
      }

      const buffer = await data.toBuffer()
      const contentType = data.mimetype
      const fileName = data.filename
      const fileSize = buffer.length

      // 计算 SHA256 哈希
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

      // 检查是否已存在相同哈希的文件（重复检测）
      const existingFile = await prisma.uploadedFile.findUnique({
        where: { sha256 }
      })

      if (existingFile) {
        // 返回已存在的文件信息
        const chunkSummary = await fileChunkService.getFileChunksSummary(existingFile.id)
        return reply.send({
          id: existingFile.id,
          url: existingFile.url,
          fileName: existingFile.fileName,
          size: existingFile.fileSize,
          contentType: existingFile.contentType,
          sha256: existingFile.sha256,
          isExisting: true,
          chunkCount: chunkSummary.totalChunks,
          chapters: chunkSummary.chapters
        })
      }

      // 新文件：存储并创建数据库记录
      const storageKey = `uploads/${Date.now()}-${fileName}`
      const contentBase64 = buffer.toString('base64')
      const url = await storageService.upload(storageKey, contentBase64, contentType)

      // 保存到数据库
      const uploadedFile = await prisma.uploadedFile.create({
        data: {
          fileName,
          fileSize,
          contentType,
          sha256,
          storageKey,
          url
        }
      })

      // 同步执行文件分片（直接使用上传的文件内容）
      let chunkCount = 0
      try {
        // 直接使用上传的文件内容进行分片，不需要从存储重新加载
        const content = Buffer.from(contentBase64, 'base64').toString('utf-8')
        console.log(`[Upload] Content length: ${content.length} chars, file type: ${contentType}`)

        const chunkResult = await fileChunkService.chunkFileWithContent(uploadedFile.id, content)
        chunkCount = chunkResult.chunks.length
        console.log(`[Upload] File chunked into ${chunkCount} pieces`)
      } catch (chunkError: any) {
        console.error('[Upload] Chunking failed:', chunkError)
        // 分片失败不影响文件上传成功
      }

      return reply.send({
        id: uploadedFile.id,
        url: uploadedFile.url,
        fileName: uploadedFile.fileName,
        size: uploadedFile.fileSize,
        contentType: uploadedFile.contentType,
        sha256: uploadedFile.sha256,
        isExisting: false,
        chunkCount
      })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 获取文件分片信息
  fastify.get('/:id/chunks', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const summary = await fileChunkService.getFileChunksSummary(id)
      return reply.send(summary)
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 读取指定分片（Agent工具调用）
  fastify.post('/chunks/read', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fileId, chunkIndices, chapterId } = request.body as any

      if (!fileId) {
        return reply.status(400).send({ error: 'fileId is required' })
      }

      const result = await fileChunkService.readChunks(fileId, chunkIndices, chapterId)
      return reply.send(result)
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 获取文件列表
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const files = await prisma.uploadedFile.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100
      })
      return reply.send({ files })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 获取单个文件信息
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const file = await prisma.uploadedFile.findUnique({
        where: { id }
      })
      if (!file) {
        return reply.status(404).send({ error: 'File not found' })
      }
      return reply.send({ file })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // 删除文件
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params
      const file = await prisma.uploadedFile.findUnique({
        where: { id }
      })
      if (!file) {
        return reply.status(404).send({ error: 'File not found' })
      }

      // 从存储中删除
      await storageService.delete(file.storageKey)

      // 从数据库删除
      await prisma.uploadedFile.delete({
        where: { id }
      })

      return reply.send({ success: true })
    } catch (error: any) {
      request.log.error(error)
      return reply.status(500).send({ error: error.message })
    }
  })
}