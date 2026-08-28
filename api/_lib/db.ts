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
        await client.query(`
          CREATE TABLE IF NOT EXISTS price_history (
            id SERIAL PRIMARY KEY,
            product_id TEXT NOT NULL,
            color_id TEXT NOT NULL,
            price NUMERIC NOT NULL,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS price_history_lookup ON price_history (product_id, color_id, recorded_at);
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS product_events (
            id SERIAL PRIMARY KEY,
            telegram_user_id TEXT,
            product_id TEXT NOT NULL,
            event_type TEXT NOT NULL CHECK (event_type IN ('view', 'order')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS product_events_product_lookup ON product_events (product_id, event_type, created_at);
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS product_events_user_lookup ON product_events (telegram_user_id, created_at);
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS product_scores (
            product_id TEXT PRIMARY KEY,
            score NUMERIC NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS product_similar (
            product_id TEXT NOT NULL,
            similar_product_id TEXT NOT NULL,
            weight NUMERIC NOT NULL,
            PRIMARY KEY (product_id, similar_product_id)
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS score_weights (
            id INTEGER PRIMARY KEY DEFAULT 1,
            discount NUMERIC NOT NULL DEFAULT 0.25,
            price_vs_history NUMERIC NOT NULL DEFAULT 0.25,
            views NUMERIC NOT NULL DEFAULT 0.15,
            orders NUMERIC NOT NULL DEFAULT 0.25,
            trending NUMERIC NOT NULL DEFAULT 0.1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (id = 1)
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
