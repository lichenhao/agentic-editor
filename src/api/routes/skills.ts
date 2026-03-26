import { Hono } from 'hono';
import { query } from '../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export const skillRoutes = new Hono();

// List skills
skillRoutes.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');

  if (!tenantId) {
    return c.json({ error: 'Missing tenantId query parameter' }, 400);
  }

  const skills = await query(
    'SELECT * FROM skills WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );

  return c.json({ skills });
});

// Get skill by ID
skillRoutes.get('/:id', async (c) => {
  const skillId = c.req.param('id');

  const rows = await query('SELECT * FROM skills WHERE id = $1', [skillId]);

  if (!rows[0]) {
    return c.json({ error: 'Skill not found' }, 404);
  }

  return c.json(rows[0]);
});

// Create skill
skillRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { tenantId, name, description, promptTemplate, tools, createdBy } = body;

  if (!tenantId || !name || !promptTemplate) {
    return c.json({ error: 'Missing required fields: tenantId, name, promptTemplate' }, 400);
  }

  const id = uuidv4();
  const now = new Date();

  await query(
    `INSERT INTO skills (id, tenant_id, name, description, prompt_template, tools, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, tenantId, name, description || null, promptTemplate, JSON.stringify(tools || []), createdBy || null, now, now]
  );

  return c.json({
    id,
    tenantId,
    name,
    description,
    promptTemplate,
    tools: tools || [],
    createdBy,
    createdAt: now,
    updatedAt: now,
  }, 201);
});

// Update skill
skillRoutes.put('/:id', async (c) => {
  const skillId = c.req.param('id');
  const body = await c.req.json();

  const sets: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (body.name !== undefined) {
    sets.push(`name = $${paramIndex++}`);
    values.push(body.name);
  }
  if (body.description !== undefined) {
    sets.push(`description = $${paramIndex++}`);
    values.push(body.description);
  }
  if (body.promptTemplate !== undefined) {
    sets.push(`prompt_template = $${paramIndex++}`);
    values.push(body.promptTemplate);
  }
  if (body.tools !== undefined) {
    sets.push(`tools = $${paramIndex++}`);
    values.push(JSON.stringify(body.tools));
  }

  sets.push(`updated_at = $${paramIndex++}`);
  values.push(new Date());

  values.push(skillId);

  await query(
    `UPDATE skills SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  return c.json({ success: true });
});

// Delete skill
skillRoutes.delete('/:id', async (c) => {
  const skillId = c.req.param('id');
  await query('DELETE FROM skills WHERE id = $1', [skillId]);

  return c.json({ success: true });
});