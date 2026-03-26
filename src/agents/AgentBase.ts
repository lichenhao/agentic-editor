import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { Agent, AgentMetrics, ContextMessage } from '../domain/entities/index.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';

export interface AgentExecutionContext {
  threadId: string;
  messages: ContextMessage[];
  metadata?: Record<string, any>;
}

export interface AgentExecutionResult {
  output: string;
  toolCalls: Array<{
    tool: string;
    input: Record<string, any>;
    output: any;
    durationMs: number;
  }>;
  tokenUsed: number;
  durationMs: number;
}

export abstract class AgentBase {
  protected client: Anthropic;
  protected toolRegistry: ToolRegistry;

  constructor(
    protected agent: Agent,
    protected tenantId: string
  ) {
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    const baseUrl = config.anthropicApiUrl || process.env.ANTHROPIC_BASE_URL;

    this.client = new Anthropic({
      apiKey: apiKey,
      baseURL: baseUrl,
    });
    this.toolRegistry = new ToolRegistry();
  }

  abstract execute(input: string, context: AgentExecutionContext): Promise<AgentExecutionResult>;

  protected async callLLM(
    messages: ContextMessage[],
    systemPrompt?: string
  ): Promise<{
    content: string;
    toolCalls: any[];
    inputTokens: number;
    outputTokens: number;
  }> {
    // Filter messages to only user and assistant roles (Claude API limitation)
    const llmMessages = messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt || this.agent.systemPrompt,
      messages: llmMessages as any,
      tools: this.toolRegistry.getToolDefinitions(),
    });

    // Extract text content and tool calls
    let content = '';
    const toolCalls: any[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    return {
      content,
      toolCalls,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  protected async executeToolCall(toolCall: {
    id: string;
    name: string;
    input: Record<string, any>;
  }): Promise<{ output: any; durationMs: number }> {
    const startTime = Date.now();
    const tool = this.toolRegistry.getTool(toolCall.name);

    if (!tool) {
      return {
        output: { error: `Tool ${toolCall.name} not found` },
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const result = await tool.execute(toolCall.input, {
        tenantId: this.tenantId,
        agentId: this.agent.id,
        workspacePath: config.workspacePath,
      });

      return { output: result, durationMs: Date.now() - startTime };
    } catch (error) {
      return {
        output: { error: error instanceof Error ? error.message : String(error) },
        durationMs: Date.now() - startTime,
      };
    }
  }

  protected buildSystemPrompt(): string {
    let prompt = this.agent.systemPrompt;

    // Add SOUL.md if exists
    if (this.agent.soulMd) {
      prompt += `\n\n## Agent Soul\n${this.agent.soulMd}`;
    }

    // Add AGENTS.md if exists
    if (this.agent.agentsMd) {
      prompt += `\n\n## Behavior Rules\n${this.agent.agentsMd}`;
    }

    // Add MEMORY.md if exists
    if (this.agent.memoryMd) {
      prompt += `\n\n## Long-term Memory\n${this.agent.memoryMd}`;
    }

    return prompt;
  }

  getAgent(): Agent {
    return this.agent;
  }

  getId(): string {
    return this.agent.id;
  }

  getRole(): string {
    return this.agent.role;
  }

  isActive(): boolean {
    return this.agent.status === 'active';
  }

  async updateMetrics(metrics: Partial<AgentMetrics>): Promise<void> {
    this.agent.metrics = { ...this.agent.metrics, ...metrics };
  }
}

// Factory for creating agents
export class AgentFactory {
  static createAgent(agent: Agent, tenantId: string): AgentBase {
    // Import here to avoid circular dependency
    switch (agent.role) {
      case 'supervisor':
        return new (require('./SupervisorAgent.js')).SupervisorAgent(agent, tenantId);
      case 'specialist':
      case 'spec-skill':
        return new (require('./SpecialistAgent.js')).SpecialistAgent(agent, tenantId);
      default:
        return new (require('./SpecialistAgent.js')).SpecialistAgent(agent, tenantId);
    }
  }
}