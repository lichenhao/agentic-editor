import { ClickHouse } from '@clickhouse/client';
import { config } from '../config/index.js';

let client: ClickHouse | null = null;

export function getClickHouse(): ClickHouse {
  if (!client) {
    client = new ClickHouse({
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

  const rows: T[] = [];
  for await (const row of result.stream()) {
    rows.push(JSON.parse(row.text) as T);
  }
  return rows;
}

export async function clickHouseInsert(
  table: string,
  data: Record<string, any>[]
): Promise<void> {
  const values = data.map(row => JSON.stringify(row)).join('\n');

  await getClickHouse().insert({
    table,
    values,
    format: 'JSONEachRow',
  });
}

export async function closeClickHouse(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export { ClickHouse } from '@clickhouse/client';