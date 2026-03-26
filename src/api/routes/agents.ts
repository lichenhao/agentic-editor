import { Hono } from 'hono';
import { agentRepository } from '../../db/repositories/AgentRepository.js';

export const agentRoutes = new Hono();

// List agents
agentRoutes.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');

  if (!tenantId) {
    return c.json({ error: 'Missing tenantId query parameter' }, 400);
  }

  const agents = await agentRepository.findActive(tenantId);
  return c.json({ agents });
});

// Get agent by ID
agentRoutes.get('/:id', async (c) => {
  const agentId = c.req.param('id');
  const agent = await agentRepository.findById(agentId);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json(agent);
});

// Get agent assessment history
agentRoutes.get('/:id/assessment', async (c) => {
  const agentId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '10');

  const history = await agentRepository.getAssessmentHistory(agentId, limit);
  return c.json({ history });
});

// Create agent
agentRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { tenantId, name, role, systemPrompt, tools, templateId } = body;

  if (!tenantId || !name || !role || !systemPrompt) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const agent = await agentRepository.create({
    tenantId,
    name,
    role,
    systemPrompt,
    tools,
    templateId,
  });

  return c.json(agent, 201);
});

// Update agent
agentRoutes.put('/:id', async (c) => {
  const agentId = c.req.param('id');
  const body = await c.req.json();

  await agentRepository.update(agentId, body);

  return c.json({ success: true });
});

// Delete (soft) agent
agentRoutes.delete('/:id', async (c) => {
  const agentId = c.req.param('id');
  await agentRepository.softDelete(agentId);

  return c.json({ success: true });
});