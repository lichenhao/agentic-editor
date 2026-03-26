import { z } from 'zod';
import { fileTool } from './implementations/FileTool.js';
import { searchTool } from './implementations/SearchTool.js';
import { webFetchTool } from './implementations/WebFetchTool.js';
import { bashTool } from './implementations/BashTool.js';

// Tool types - exported for use in tool implementations
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute(input: any, context: ToolContext): Promise<any>;
}

export interface ToolContext {
  tenantId: string;
  agentId: string;
  workspacePath: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    this.register(fileTool);
    this.register(searchTool);
    this.register(webFetchTool);
    this.register(bashTool);
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];

    for (const [name, tool] of this.tools) {
      // Parse the input schema to get properties
      const properties: Record<string, any> = {};
      const required: string[] = [];

      // Get the shape from the schema if it's a ZodObject
      const schema = tool.inputSchema;
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        for (const [key, value] of Object.entries(shape)) {
          let type = 'string';
          if (value instanceof z.ZodString) type = 'string';
          else if (value instanceof z.ZodNumber) type = 'number';
          else if (value instanceof z.ZodBoolean) type = 'boolean';
          else if (value instanceof z.ZodArray) type = 'array';
          else if (value instanceof z.ZodObject) type = 'object';

          properties[key] = {
            type,
            description: (value as any).description || '',
          };
          if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodNullable)) {
            required.push(key);
          }
        }
      }

      definitions.push({
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      });
    }

    return definitions;
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const toolRegistry = new ToolRegistry();