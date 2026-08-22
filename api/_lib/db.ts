import { db } from '@vercel/postgres';

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await db.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            sale_id TEXT NOT NULL,
            featured_rank INTEGER NOT NULL DEFAULT 0,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS sale_windows (
            sale_id TEXT PRIMARY KEY,
            end_date TIMESTAMPTZ,
            active BOOLEAN NOT NULL DEFAULT true,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);
      } finally {
        client.release();
      }
    })();
  }
  return schemaReady;
}

export { db };
