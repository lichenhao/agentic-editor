import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { setupWebSocket } from './services/websocket.service'
import seedDatabase from './services/seed.service'

const fastify = Fastify({
  logger: true
})

// Register plugins
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
})
await fastify.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

// Setup WebSocket
setupWebSocket(fastify)

// Health check
fastify.get('/health', async () => ({ status: 'ok' }))

const start = async () => {
  try {
    // 初始化数据库种子数据（Agent/Skill 配置）
    await seedDatabase()

    await fastify.listen({ port: 3000 })
    console.log('Server running at http://localhost:3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()