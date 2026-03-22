import Anthropic from '@anthropic-ai/sdk'

// Claude API Client - 使用环境变量中的私有API配置
const authToken = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || ''
const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

export const anthropic = new Anthropic({
  apiKey: authToken,
  baseURL: baseURL
})

// Check if API key is configured
export function isClaudeConfigured(): boolean {
  return !!(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY)
}

// Call Claude API
export async function callClaude(prompt: string, systemPrompt?: string): Promise<string> {
  if (!isClaudeConfigured()) {
    throw new Error('Claude API is not configured. Please set ANTHROPIC_AUTH_TOKEN in .env')
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt || '你是一个专业的AI短剧生成助手，帮助用户将小说转换为短剧视频。',
      messages: [
        { role: 'user', content: prompt }
      ]
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (error: any) {
    console.error('[Claude API] Error:', error.message)
    throw error
  }
}

// Call Claude with messages array
export async function callClaudeWithMessages(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt?: string
): Promise<string> {
  if (!isClaudeConfigured()) {
    throw new Error('Claude API is not configured. Please set ANTHROPIC_AUTH_TOKEN in .env')
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt || '你是一个专业的AI短剧生成助手，帮助用户将小说转换为短剧视频。',
      messages: messages as any
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (error: any) {
    console.error('[Claude API] Error:', error.message)
    throw error
  }
}