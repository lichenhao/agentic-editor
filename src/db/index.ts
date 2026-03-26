import { Pool, PoolClient as PgPoolClient } from 'pg';
import Redis from 'ioredis';
import { config } from '../config/index.js';

let pool: Pool | null = null;
let redis: Redis | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });
  }
  return pool;
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }
  return redis;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows;
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function execute(text: string, params?: any[]): Promise<number> {
  const result = await getPool().query(text, params);
  return result.rowCount || 0;
}

export async function transaction<T>(fn: (client: PgPoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Re-export with alias for compatibility
export type PoolClient = PgPoolClient;
export { Pool } from 'pg';
export { Redis } from 'ioredis';