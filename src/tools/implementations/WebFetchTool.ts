import { z } from 'zod';
import { Tool, ToolContext } from '../ToolRegistry.js';

const WebFetchSchema = z.object({
  url: z.string().url().describe('The URL to fetch'),
  prompt: z.string().optional().describe('What to extract from the page'),
});

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: 'Fetch content from a URL and extract information',
  inputSchema: WebFetchSchema,
  async execute(input: any, context: ToolContext): Promise<any> {
    const { url, prompt } = input;

    try {
      // Use native fetch (available in Node 18+)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Agentic-Editor/1.0',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const text = await response.text();

      // If prompt provided, we would use LLM to extract (simplified for MVP)
      if (prompt) {
        return {
          success: true,
          url,
          content: text.slice(0, 10000), // Limit content size
          extracted: prompt,
          note: 'Content extraction with prompt requires LLM integration',
        };
      }

      return {
        success: true,
        url,
        content: text.slice(0, 10000),
        contentLength: text.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};