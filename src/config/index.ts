import { z } from 'zod';

const configSchema = z.object({
  // Database
  databaseUrl: z.string().default('postgresql://agentic:agentic_secret@localhost:5432/agentic_editor'),
  redisUrl: z.string().default('redis://localhost:6379'),
  clickhouseUrl: z.string().default('http://localhost:8123'),
  clickhouseUser: z.string().default('agentic'),
  clickhousePassword: z.string().default('agentic_secret'),

  // JWT
  jwtSecret: z.string().default('dev-secret-change-in-production'),

  // Claude API
  anthropicApiKey: z.string().optional(),
  anthropicApiUrl: z.string().optional(),

  // App
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // OpenTelemetry
  otelExporterOtlpEndpoint: z.string().optional(),

  // Workspace
  workspacePath: z.string().default('/workspace'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  // Load from process.env with prefix stripping
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Convert DATABASE_URL -> databaseUrl
    const normalizedKey = key.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    env[normalizedKey] = value;
  }

  return configSchema.parse(env);
}

export const config = loadConfig();
