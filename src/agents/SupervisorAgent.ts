import { AgentBase, AgentExecutionContext, AgentExecutionResult } from './AgentBase.js';
import { Agent, ContextMessage } from '../domain/entities/index.js';
import { v4 as uuidv4 } from 'uuid';

interface SupervisorState {
  input: string;
  clarifiedInput?: string;
  decomposedTasks: SubTask[];
  results: TaskResult[];
  finalOutput?: string;
}

interface SubTask {
  id: string;
  name: string;
  description: string;
  dependencies: string[];
}

interface TaskResult {
  taskId: string;
  output: string;
  status: 'completed' | 'failed';
  error?: string;
}

// Simple message type for internal use
interface SimpleMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class SupervisorAgent extends AgentBase {
  constructor(agent: Agent, tenantId: string) {
    super(agent, tenantId);
  }

  async execute(input: string, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const toolCalls: AgentExecutionResult['toolCalls'] = [];

    try {
      // Step 1: Clarify requirements if needed
      const clarified = await this.clarifyRequirements(input);

      // Step 2: Decompose into subtasks
      const subtasks = await this.decomposeTask(clarified);

      // Step 3: Execute subtasks (parallel or sequential based on dependencies)
      const results = await this.executeSubtasks(subtasks, context);

      // Step 4: Aggregate results
      const finalOutput = await this.aggregateResults(results);

      return {
        output: finalOutput,
        toolCalls,
        tokenUsed: 0, // Will be calculated from LLM calls
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        toolCalls,
        tokenUsed: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async clarifyRequirements(input: string): Promise<string> {
    const messages: SimpleMessage[] = [
      { role: 'user', content: `
Analyze the following user request and clarify if needed:

User Request: ${input}

If the request is clear, return it as-is. If unclear, provide clarification questions.
Return ONLY the clarified request or questions, nothing else.
` }
    ];

    // Convert to ContextMessage format
    const contextMessages: ContextMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date().toISOString(),
    }));

    const response = await this.callLLM(contextMessages, this.buildSystemPrompt());
    return response.content.trim();
  }

  private async decomposeTask(input: string): Promise<SubTask[]> {
    const messages: SimpleMessage[] = [
      { role: 'user', content: `
Decompose the following task into subtasks:

Task: ${input}

Return a JSON array of subtasks with the following format:
[
  { "id": "uuid", "name": "task name", "description": "task description", "dependencies": [] }
]

Consider:
- Dependencies between subtasks
- Logical order of execution
- Each subtask should be independently executable
` }
    ];

    const contextMessages: ContextMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date().toISOString(),
    }));

    const response = await this.callLLM(contextMessages, this.buildSystemPrompt());

    try {
      // Try to parse JSON from the response
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const tasks = JSON.parse(jsonMatch[0]);
        return tasks.map((t: any) => ({
          id: t.id || uuidv4(),
          name: t.name,
          description: t.description,
          dependencies: t.dependencies || [],
        }));
      }
    } catch (e) {
      // If JSON parsing fails, create a single task
    }

    // Fallback: create a single task
    return [{
      id: uuidv4(),
      name: 'Main Task',
      description: input,
      dependencies: [],
    }];
  }

  private async executeSubtasks(
    subtasks: SubTask[],
    context: AgentExecutionContext
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    // Build dependency graph
    const completed = new Set<string>();

    // Execute tasks in order based on dependencies
    for (const subtask of subtasks) {
      // Wait for dependencies
      while (subtask.dependencies.some(d => !completed.has(d))) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Execute the subtask
      try {
        const result = await this.executeSubtask(subtask, context, results);
        results.push({ taskId: subtask.id, output: result, status: 'completed' });
        completed.add(subtask.id);
      } catch (error) {
        results.push({
          taskId: subtask.id,
          output: '',
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
        completed.add(subtask.id);
      }
    }

    return results;
  }

  private async executeSubtask(
    subtask: SubTask,
    context: AgentExecutionContext,
    previousResults: TaskResult[]
  ): Promise<string> {
    // Build context from previous results
    const contextText = previousResults.length > 0
      ? `\n\nPrevious subtask results:\n${previousResults.map(r => `- ${r.taskId}: ${r.output}`).join('\n')}`
      : '';

    const messages: SimpleMessage[] = [
      {
        role: 'user',
        content: `Execute the following subtask:\n\nName: ${subtask.name}\nDescription: ${subtask.description}${contextText}`
      },
    ];

    const contextMessages: ContextMessage[] = [
      ...context.messages,
      ...messages.map(m => ({
        role: m.role as 'user',
        content: m.content,
        timestamp: new Date().toISOString(),
      })),
    ];

    const response = await this.callLLM(contextMessages, this.buildSystemPrompt());

    // Execute any tool calls
    for (const toolCall of response.toolCalls) {
      const toolResult = await this.executeToolCall(toolCall);
      // Add tool result to messages for next iteration
      contextMessages.push({
        role: 'tool',
        content: JSON.stringify(toolResult.output),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        timestamp: new Date().toISOString(),
      });
    }

    return response.content;
  }

  private async aggregateResults(results: TaskResult[]): Promise<string> {
    const successfulResults = results.filter(r => r.status === 'completed');
    const failedResults = results.filter(r => r.status === 'failed');

    const messages: SimpleMessage[] = [
      {
        role: 'user',
        content: `
Aggregate the following subtask results into a final response:

Successful tasks:
${successfulResults.map(r => `- ${r.output}`).join('\n\n')}

${failedResults.length > 0 ? `Failed tasks:\n${failedResults.map(r => `- ${r.error}`).join('\n')}` : ''}

Provide a clear, concise summary of all completed work.
`
      }
    ];

    const contextMessages: ContextMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date().toISOString(),
    }));

    const response = await this.callLLM(contextMessages, this.buildSystemPrompt());
    return response.content;
  }
}