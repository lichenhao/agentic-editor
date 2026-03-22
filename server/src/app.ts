import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { projectRoutes } from './api/projects/routes'
import { uploadRoutes } from './api/upload/routes'
import { adminRoutes } from './api/admin/routes'
import { AgentLoader } from './agents/loader/agent.loader'
import { setupWebSocket } from './services/websocket.service'
import { chatRoutes } from './api/chat/routes'

const fastify = Fastify({
  logger: true
})

// Register plugins
await fastify.register(cors, { origin: true })
await fastify.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

// Setup WebSocket
setupWebSocket(fastify)

// Register routes
await fastify.register(chatRoutes, { prefix: '/api/chat' })
await fastify.register(projectRoutes, { prefix: '/api/projects' })
await fastify.register(uploadRoutes, { prefix: '/api/upload' })
await fastify.register(adminRoutes, { prefix: '/api' })

// Health check
fastify.get('/health', async () => ({ status: 'ok' }))

const start = async () => {
  try {
    // 初始化 Agent 和 Skills 配置
    await AgentLoader.initialize()

    await fastify.listen({ port: 3000 })
    console.log('Server running at http://localhost:3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()