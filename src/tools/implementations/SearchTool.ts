import { z } from 'zod';
import { Tool, ToolContext } from '../ToolRegistry.js';

const SearchSchema = z.object({
  query: z.string().describe('The search query'),
  max_results: z.number().optional().default(5).describe('Maximum number of results'),
});

// Simple in-memory search (would integrate with vector DB in production)
const searchIndex = new Map<string, { content: string; metadata: any }[]>();

export const searchTool: Tool = {
  name: 'search',
  description: 'Search for information in the knowledge base',
  inputSchema: SearchSchema,
  async execute(input: any, context: ToolContext): Promise<any> {
    const { query, max_results } = input;

    // In production, this would query a vector database or search engine
    // For MVP, return a placeholder response
    return {
      success: true,
      results: [],
      message: 'Search functionality requires vector database integration',
      query,
    };
  },
};

// Add document to search index (for knowledge base integration)
export async function indexDocument(
  tenantId: string,
  docId: string,
  content: string,
  metadata: any
): Promise<void> {
  const key = `${tenantId}:${docId}`;
  const docs = searchIndex.get(tenantId) || [];
  docs.push({ content, metadata });
  searchIndex.set(tenantId, docs);
}

// Search indexed documents
export async function searchDocuments(
  tenantId: string,
  query: string,
  limit = 5
): Promise<Array<{ content: string; metadata: any }>> {
  const docs = searchIndex.get(tenantId) || [];
  // Simple keyword matching (would use semantic search in production)
  const results = docs.filter(doc =>
    doc.content.toLowerCase().includes(query.toLowerCase())
  );
  return results.slice(0, limit);
}