import { Hono } from 'hono';
import { policyEngine } from '../../policies/PolicyEngine.js';
import { policyRepository } from '../../db/repositories/PolicyRepository.js';

export const policyRoutes = new Hono();

// List policies
policyRoutes.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');
  const type = c.req.query('type');

  if (!tenantId) {
    return c.json({ error: 'Missing tenantId' }, 400);
  }

  const policies = type
    ? await policyRepository.findByType(type as any, tenantId)
    : await policyRepository.findByTenant(tenantId);

  return c.json({ policies });
});

// Get policy by ID
policyRoutes.get('/:id', async (c) => {
  const policyId = c.req.param('id');
  const policy = await policyRepository.findById(policyId);

  if (!policy) {
    return c.json({ error: 'Policy not found' }, 404);
  }

  return c.json(policy);
});

// Create policy
policyRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { tenantId, name, type, condition, action, priority } = body;

  if (!tenantId || !name || !type || !condition || !action) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const policy = await policyEngine.createPolicy({
    tenantId,
    name,
    type,
    condition,
    action,
    priority,
  });

  return c.json(policy, 201);
});

// Update policy
policyRoutes.put('/:id', async (c) => {
  const policyId = c.req.param('id');
  const body = await c.req.json();

  await policyEngine.updatePolicy(policyId, body);

  return c.json({ success: true });
});

// Delete policy
policyRoutes.delete('/:id', async (c) => {
  const policyId = c.req.param('id');
  await policyEngine.deletePolicy(policyId);

  return c.json({ success: true });
});

// Enable policy
policyRoutes.post('/:id/enable', async (c) => {
  const policyId = c.req.param('id');
  await policyRepository.enable(policyId);

  return c.json({ success: true });
});

// Disable policy
policyRoutes.post('/:id/disable', async (c) => {
  const policyId = c.req.param('id');
  await policyRepository.disable(policyId);

  return c.json({ success: true });
});

// Validate policy condition (dry-run)
policyRoutes.post('/validate', async (c) => {
  const body = await c.req.json();
  const { condition, context } = body;

  if (!condition) {
    return c.json({ error: 'Missing condition' }, 400);
  }

  const result = policyEngine.evaluateCondition(condition, context || {});

  return c.json({ result, condition, context });
});

// Check permission
policyRoutes.post('/check-permission', async (c) => {
  const body = await c.req.json();
  const { action, tenantId, userId, tool, resource } = body;

  if (!action || !tenantId) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const decision = await policyEngine.checkPermission(action, {
    tenantId,
    userId,
    tool,
    resource,
  });

  return c.json(decision);
});

// Check if approval required
policyRoutes.post('/check-approval', async (c) => {
  const body = await c.req.json();
  const { action, tenantId, userId, tool, resource } = body;

  if (!action || !tenantId) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const result = await policyEngine.requiresApproval(action, {
    tenantId,
    userId,
    tool,
    resource,
  });

  return c.json(result);
});