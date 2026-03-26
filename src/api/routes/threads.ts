import { Hono } from 'hono';
import { contextManager } from '../../context/ContextManager.js';
import { query } from '../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export const threadRoutes = new Hono();

// Create thread
threadRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { tenantId, userId, title } = body;

  if (!tenantId || !userId) {
    return c.json({ error: 'Missing required fields: tenantId, userId' }, 400);
  }

  const thread = await contextManager.createThread(tenantId, userId, title);
  return c.json(thread, 201);
});

// Get thread
threadRoutes.get('/:id', async (c) => {
  const threadId = c.req.param('id');
  const thread = await contextManager.getThread(threadId);

  if (!thread) {
    return c.json({ error: 'Thread not found' }, 404);
  }

  return c.json(thread);
});

// Get thread context
threadRoutes.get('/:id/context', async (c) => {
  const threadId = c.req.param('id');
  const context = await contextManager.load(threadId);
  return c.json({ context });
});

// Update thread context
threadRoutes.put('/:id/context', async (c) => {
  const threadId = c.req.param('id');
  const body = await c.req.json();
  const { context } = body;

  if (!Array.isArray(context)) {
    return c.json({ error: 'Context must be an array' }, 400);
  }

  await contextManager.save(threadId, context);
  return c.json({ success: true });
});

// Create branch from thread
threadRoutes.post('/:id/branch', async (c) => {
  const parentThreadId = c.req.param('id');
  const body = await c.req.json();
  const { tenantId, userId, title } = body;

  const parent = await contextManager.getThread(parentThreadId);
  if (!parent) {
    return c.json({ error: 'Parent thread not found' }, 404);
  }

  const branch = await contextManager.createThread(
    tenantId || parent.tenantId,
    userId || parent.userId,
    title || `Branch of ${parent.title || parentThreadId}`
  );

  // Update branch metadata
  await query(
    'UPDATE threads SET branch_root_id = $1, parent_branch_id = $2 WHERE id = $3',
    [parent.branchRootId || parentThreadId, parentThreadId, branch.id]
  );

  // Copy context from parent
  const parentContext = await contextManager.load(parentThreadId);
  await contextManager.save(branch.id, parentContext);

  return c.json(branch, 201);
});

// List user threads
threadRoutes.get('/', async (c) => {
  const userId = c.req.query('userId');
  const tenantId = c.req.query('tenantId');

  if (!userId || !tenantId) {
    return c.json({ error: 'Missing userId or tenantId' }, 400);
  }

  const threads = await query(
    'SELECT * FROM threads WHERE user_id = $1 AND tenant_id = $2 ORDER BY updated_at DESC LIMIT 20',
    [userId, tenantId]
  );

  return c.json({ threads });
});