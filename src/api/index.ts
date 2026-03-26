import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { taskRoutes } from './routes/tasks.js';
import { agentRoutes } from './routes/agents.js';
import { threadRoutes } from './routes/threads.js';
import { skillRoutes } from './routes/skills.js';
import { approvalRoutes } from './routes/approvals.js';
import { policyRoutes } from './routes/policies.js';
import { config } from '../config/index.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
app.route('/api/tasks', taskRoutes);
app.route('/api/agents', agentRoutes);
app.route('/api/threads', threadRoutes);
app.route('/api/skills', skillRoutes);
app.route('/api/approvals', approvalRoutes);
app.route('/api/policies', policyRoutes);

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: err.message }, 500);
});

export default {
  port: config.port,
  fetch: app.fetch,
};