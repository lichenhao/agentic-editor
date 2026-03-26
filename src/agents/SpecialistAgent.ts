import { AgentBase, AgentExecutionContext, AgentExecutionResult } from './AgentBase.js';
import { Agent, ContextMessage } from '../domain/entities/index.js';

export class SpecialistAgent extends AgentBase {
  private maxIterations = 5;

  constructor(agent: Agent, tenantId: string) {
    super(agent, tenantId);
  }

  async execute(input: string, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const toolCalls: AgentExecutionResult['toolCalls'] = [];

    // Build messages including context
    const messages: ContextMessage[] = [
      ...context.messages,
      { role: 'user', content: input, timestamp: new Date().toISOString() }
    ];

    let iterations = 0;
    let hasToolCalls = true;

    while (hasToolCalls && iterations < this.maxIterations) {
      // Call LLM with current messages
      const response = await this.callLLM(messages, this.buildSystemPrompt());

      // Add assistant response to messages
      messages.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
      });

      // Execute tool calls if any
      hasToolCalls = response.toolCalls.length > 0;

      for (const toolCall of response.toolCalls) {
        const toolResult = await this.executeToolCall(toolCall);

        toolCalls.push({
          tool: toolCall.name,
          input: toolCall.input,
          output: toolResult.output,
          durationMs: toolResult.durationMs,
        });

        // Add tool result to messages
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.output),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          timestamp: new Date().toISOString(),
        });
      }

      iterations++;
    }

    // Get the final output (last assistant message)
    const finalMessage = messages.filter(m => m.role === 'assistant').pop();
    const output = finalMessage?.content || '';

    const totalTokens = 0; // Would calculate from all LLM calls

    return {
      output,
      toolCalls,
      tokenUsed: totalTokens,
      durationMs: Date.now() - startTime,
    };
  }
}