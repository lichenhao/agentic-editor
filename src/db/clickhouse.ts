import { createClient, ClickHouseClient } from '@clickhouse/client';
import { config } from '../config/index.js';

let client: ClickHouseClient | null = null;

export function getClickHouse(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: config.clickhouseUrl,
      username: config.clickhouseUser,
      password: config.clickhousePassword,
      database: 'agentic_editor',
    });
  }
  return client;
}

export async function clickHouseQuery<T = any>(query: string): Promise<T[]> {
  const result = await getClickHouse().query({
    query,
    format: 'JSONEachRow',
  });

  // Use the JSON method for simpler parsing
  const data = await result.json();
  return (data as any[]) || [];
}

export async function clickHouseInsert(
  table: string,
  data: Record<string, any>[]
): Promise<void> {
  await getClickHouse().insert({
    table,
    values: data,
    format: 'JSONEachRow',
  });
}

export async function closeClickHouse(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export { ClickHouseClient } from '@clickhouse/client';