import { Hono } from 'hono';
import { approvalHandler } from '../../orchestration/ApprovalHandler.js';

export const approvalRoutes = new Hono();

// Get pending approvals
approvalRoutes.get('/', async (c) => {
  const userId = c.req.query('userId');
  const tenantId = c.req.query('tenantId');

  if (!userId || !tenantId) {
    return c.json({ error: 'Missing userId or tenantId' }, 400);
  }

  const approvals = await approvalHandler.getPendingApprovals(userId, tenantId);
  return c.json({ approvals });
});

// Get approval by ID
approvalRoutes.get('/:id', async (c) => {
  const approvalId = c.req.param('id');
  const approval = await approvalHandler.getApproval(approvalId);

  if (!approval) {
    return c.json({ error: 'Approval not found' }, 404);
  }

  return c.json(approval);
});

// Submit approval decision
approvalRoutes.post('/:id/decide', async (c) => {
  const approvalId = c.req.param('id');
  const body = await c.req.json();
  const { userId, approve, exempt, comment } = body;

  if (!userId) {
    return c.json({ error: 'Missing userId' }, 400);
  }

  try {
    await approvalHandler.processDecision(approvalId, userId, {
      approve: approve ?? true,
      exempt: exempt ?? false,
      comment,
    });

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to process decision' }, 400);
  }
});

// Cancel pending approval
approvalRoutes.post('/:id/cancel', async (c) => {
  const approvalId = c.req.param('id');

  await approvalHandler.cancelApproval(approvalId);

  return c.json({ success: true });
});

// Request approval for a task action
approvalRoutes.post('/request', async (c) => {
  const body = await c.req.json();
  const { taskId, subtaskId, action } = body;

  if (!taskId || !action) {
    return c.json({ error: 'Missing taskId or action' }, 400);
  }

  const approval = await approvalHandler.requestApproval(taskId, subtaskId, action);

  return c.json(approval, 201);
});