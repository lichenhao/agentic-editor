import { ContextMessage, Thread } from '../domain/entities/index.js';
import { query, getRedis, queryOne } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const MAX_TOKENS = 100000;
const PRUNE_THRESHOLD = 0.8;

export class ContextManager {
  private redis = getRedis();

  async load(threadId: string): Promise<ContextMessage[]> {
    // Try to get from Redis cache first
    const cached = await this.redis.get(`thread:${threadId}:context`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Load from database
    const thread = await queryOne<any>(
      'SELECT context FROM threads WHERE id = $1',
      [threadId]
    );

    if (!thread) {
      return [];
    }

    const context = typeof thread.context === 'string'
      ? JSON.parse(thread.context)
      : thread.context || [];

    // Cache for future requests
    await this.redis.setex(`thread:${threadId}:context`, 3600, JSON.stringify(context));

    return context;
  }

  async save(threadId: string, context: ContextMessage[]): Promise<void> {
    // Save to database
    const contextJson = JSON.stringify(context);
    const tokens = this.estimateTokens(contextJson);

    await query(
      'UPDATE threads SET context = $1, context_tokens = $2, updated_at = $3 WHERE id = $4',
      [contextJson, tokens, new Date(), threadId]
    );

    // Update cache
    await this.redis.setex(`thread:${threadId}:context`, 3600, contextJson);
  }

  async createThread(tenantId: string, userId: string, title?: string): Promise<Thread> {
    const id = uuidv4();
    const now = new Date();

    await query(
      `INSERT INTO threads (id, tenant_id, user_id, title, context, context_tokens, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, tenantId, userId, title || null, '[]', 0, now, now]
    );

    return {
      id,
      tenantId,
      userId,
      title,
      context: [],
      contextTokens: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const row = await queryOne<any>(
      'SELECT * FROM threads WHERE id = $1',
      [threadId]
    );

    return row ? this.mapToThread(row) : null;
  }

  async optimize(context: ContextMessage[]): Promise<ContextMessage[]> {
    const tokenCount = this.estimateTokens(JSON.stringify(context));

    if (tokenCount < MAX_TOKENS * PRUNE_THRESHOLD) {
      return context; // No optimization needed
    }

    // Step 1: Prune - remove low-value messages
    let optimized = this.pruneLowValue(context);

    // Step 2: Compress - merge similar content
    optimized = this.compress(optimized);

    // Step 3: Summarize - generate summary for older messages (would use LLM)
    // For MVP, just keep the most recent messages

    return optimized;
  }

  private pruneLowValue(context: ContextMessage[]): ContextMessage[] {
    // Keep system messages and recent messages
    const systemMessages = context.filter(m => m.role === 'system');
    const recentMessages = context
      .filter(m => m.role !== 'system')
      .slice(-50); // Keep last 50 non-system messages

    return [...systemMessages, ...recentMessages];
  }

  private compress(context: ContextMessage[]): ContextMessage[] {
    // Simple compression: remove duplicate consecutive messages
    const compressed: ContextMessage[] = [];
    let lastMessage: ContextMessage | null = null;

    for (const msg of context) {
      if (lastMessage && msg.role === lastMessage.role && msg.content === lastMessage.content) {
        continue; // Skip duplicate
      }
      compressed.push(msg);
      lastMessage = msg;
    }

    return compressed;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private mapToThread(row: any): Thread {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      title: row.title,
      context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context || [],
      contextTokens: row.context_tokens || 0,
      branchRootId: row.branch_root_id,
      parentBranchId: row.parent_branch_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const contextManager = new ContextManager();