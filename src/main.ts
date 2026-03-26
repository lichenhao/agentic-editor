import 'dotenv/config';
import { serve } from '@hono/node-server';
import api from './api/index.js';
import { config } from './config/index.js';

console.log(`Starting Agent Harness API on port ${config.port}...`);
console.log(`Environment: ${config.nodeEnv}`);
console.log(`API Key configured: ${config.anthropicApiKey ? 'yes' : 'no'}`);
console.log(`API URL: ${config.anthropicApiUrl || 'default'}`);

serve({
  fetch: api.fetch,
  port: config.port,
}, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`);
});