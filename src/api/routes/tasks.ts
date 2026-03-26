import { Hono } from 'hono';
import { taskRunner } from '../../orchestration/TaskRunner.js';
import { query } from '../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export const taskRoutes = new Hono();

// Create task
taskRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { tenantId, userId, input, threadId } = body;

  if (!tenantId || !userId || !input) {
    return c.json({ error: 'Missing required fields: tenantId, userId, input' }, 400);
  }

  const task = await taskRunner.createTask(tenantId, userId, input, threadId);

  // Start task execution in background
  taskRunner.runTask(task.id).catch(console.error);

  return c.json(task, 201);
});

// Get task
taskRoutes.get('/:id', async (c) => {
  const taskId = c.req.param('id');
  const task = await taskRunner.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json(task);
});

// Get task progress
taskRoutes.get('/:id/progress', async (c) => {
  const taskId = c.req.param('id');
  const progress = await taskRunner.getTaskProgress(taskId);
  return c.json(progress);
});

// List tasks
taskRoutes.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  if (!tenantId) {
    return c.json({ error: 'Missing tenantId query parameter' }, 400);
  }

  const tasks = await taskRunner.getTasksByTenant(tenantId, limit, offset);
  return c.json({ tasks, limit, offset });
});

// Submit feedback
taskRoutes.post('/:id/feedback', async (c) => {
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const { score, feedback } = body;

  await query(
    `INSERT INTO assessment_records (id, task_id, agent_id, feedback_score, feedback_text, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), taskId, null, score, feedback, new Date()]
  );

  return c.json({ success: true });
});

// Retry failed task
taskRoutes.post('/:id/retry', async (c) => {
  const taskId = c.req.param('id');
  const task = await taskRunner.getTask(taskId);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (task.status !== 'failed') {
    return c.json({ error: 'Can only retry failed tasks' }, 400);
  }

  // Reset status and re-run
  await taskRunner.runTask(taskId);

  return c.json({ success: true, taskId });
});