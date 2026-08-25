import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | undefined;

export function getTestPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Brak DATABASE_URL w testach e2e.');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function queryTestDb<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getTestPool().query<T>(text, values);
  return result.rows;
}

export async function executeTestDb(
  text: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await getTestPool().query(text, values);
  return result.rowCount ?? 0;
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
