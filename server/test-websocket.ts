/**
 * Test Script - Multi-Agent 架构自测
 * 通过 WebSocket 测试写一篇科幻小说
 */

import WebSocket from 'ws'

const WS_URL = 'ws://localhost:3000'

// 模拟用户请求：写一篇不低于3000字的短篇科幻小说
const TEST_REQUEST = `请帮我写一篇不低于3000字的短篇科幻小说，主题是人类与AI的共生关系。`

interface ServerMessage {
  type: string
  payload?: any
  sequence?: number
  timestamp?: string
}

class TestClient {
  private ws: WebSocket
  private sessionId?: string
  private messageHandler: ((msg: ServerMessage) => void) | null = null

  constructor() {
    this.ws = new WebSocket(WS_URL)
    this.setupHandlers()
  }

  private setupHandlers() {
    this.ws.on('open', () => {
      console.log('✅ WebSocket 连接成功')
      this.startTest()
    })

    this.ws.on('message', (data) => {
      const msg: ServerMessage = JSON.parse(data.toString())
      console.log(`📨 收到消息: ${msg.type}`)
      if (this.messageHandler) {
        this.messageHandler(msg)
      }
      this.handleMessage(msg)
    })

    this.ws.on('error', (err) => {
      console.error('❌ WebSocket 错误:', err.message)
    })

    this.ws.on('close', () => {
      console.log('🔌 WebSocket 连接关闭')
    })
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'SESSION_CREATED':
        this.sessionId = msg.payload.sessionId
        console.log(`📝 会话创建成功: ${this.sessionId}`)
        // 发送写小说的请求
        this.sendMessage(this.sessionId, TEST_REQUEST)
        break

      case 'SECRETARY_THINKING':
        console.log(`🤔 ${msg.payload.stage}: ${msg.payload.content}`)
        break

      case 'TASK_STATUS':
        const taskStatus = msg.payload
        console.log(`📋 任务状态: ${taskStatus.taskId} -> ${taskStatus.status} - ${taskStatus.message || ''}`)
        break

      case 'MESSAGE':
        console.log(`💬 ${msg.payload.role}: ${msg.payload.content.substring(0, 100)}...`)
        break

      case 'USER_INTERACTION':
        console.log(`⚠️ 用户交互请求: ${msg.payload.message}`)
        // 自动确认继续
        this.sendConfirm(msg.payload.taskId, true)
        break

      case 'DONE':
        console.log(`✅ 任务完成!`)
        console.log(`📊 报告: ${JSON.stringify(msg.payload.report || msg.payload.summary, null, 2)}`)
        this.getDAGStatus()
        setTimeout(() => this.getHistory(), 1000)
        break

      case 'ERROR':
        console.error(`❌ 错误: ${msg.payload.code} - ${msg.payload.message}`)
        break

      case 'DAG_STATUS':
        console.log(`🔄 DAG 状态:`)
        console.log(`  - 节点: ${msg.payload.nodes?.length || 0}`)
        console.log(`  - 边: ${msg.payload.edges?.length || 0}`)
        console.log(`  - 可执行: ${msg.payload.executable?.length || 0}`)
        break

      case 'HISTORY':
        console.log(`📚 历史记录: ${msg.payload.contexts?.length || 0} 条`)
        break
    }
  }

  private send(msg: any) {
    this.ws.send(JSON.stringify({ ...msg, sequence: Date.now() }))
  }

  private startTest() {
    console.log('🧪 开始测试: 写一篇科幻小说')
    // 创建会话
    this.send({ type: 'CREATE_SESSION', payload: { title: '科幻小说写作测试' } })
  }

  private sendMessage(sessionId: string, content: string) {
    console.log(`📤 发送消息: ${content.substring(0, 50)}...`)
    this.send({
      type: 'SEND_MESSAGE',
      payload: { sessionId, content }
    })
  }

  private sendConfirm(taskId: string, approved: boolean) {
    console.log(`📤 发送确认: taskId=${taskId}, approved=${approved}`)
    this.send({
      type: 'CONFIRM_TASK',
      payload: { taskId, approved }
    })
  }

  private getDAGStatus() {
    if (this.sessionId) {
      this.send({ type: 'GET_DAG_STATUS', payload: { sessionId: this.sessionId } })
    }
  }

  private getHistory() {
    if (this.sessionId) {
      this.send({ type: 'GET_HISTORY', payload: { sessionId: this.sessionId, limit: 20 } })
    }
    // 关闭连接
    setTimeout(() => {
      console.log('\n🧪 测试完成!')
      this.ws.close()
      process.exit(0)
    }, 2000)
  }
}

// 启动测试
console.log('🚀 启动 Multi-Agent 自测...\n')
new TestClient()