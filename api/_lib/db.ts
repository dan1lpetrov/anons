import { db } from '@vercel/postgres';

let schemaReady: Promise<void> | null = null;

// Arbitrary constant used only as a lock key — see the advisory-lock note below.
const SCHEMA_LOCK_KEY = 84237551;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runEnsureSchema().catch((err) => {
      // Don't cache a rejected promise forever: a transient failure (e.g. a lock-wait
      // timeout) would otherwise 500 every request on this warm container until it cold-starts
      // again. Reset so the next call gets a fresh attempt instead.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function runEnsureSchema(): Promise<void> {
  const client = await db.connect();
  try {
    // Every cold serverless instance calls this on its first request, so right after a deploy
    // many of them race to run the DDL below concurrently. `CREATE TABLE/INDEX IF NOT EXISTS`
    // is NOT atomic across concurrent transactions — two can both see "doesn't exist yet" and
    // both try to create it, which throws a duplicate-key error on Postgres's own pg_class
    // catalog rather than silently no-op'ing. A session advisory lock serializes those racing
    // attempts: whoever loses the race just finds everything already created and does nothing.
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);
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
      // Deprecated by sale_events below (kept, unused, rather than dropped — safer on live prod
      // data than an irreversible DROP TABLE). "A sale" used to be modeled 1:1 with a brand; it's
      // now a campaign, of which a brand can have several live at once.
      await client.query(`
        CREATE TABLE IF NOT EXISTS sale_windows (
          sale_id TEXT PRIMARY KEY,
          end_date TIMESTAMPTZ,
          active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS sale_events (
          id SERIAL PRIMARY KEY,
          sale_id TEXT NOT NULL,
          name TEXT NOT NULL,
          end_date TIMESTAMPTZ,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS sale_events_brand ON sale_events (sale_id);
      `);
      // Reseller conditions, set once at campaign creation (see api/sales.ts / admin-upload.html):
      // buyer commission %, an extra discount %, and whether to display prices in the sale's own
      // currency (USD) or convert to UAH using a bank rate snapshotted at upload time.
      await client.query(`ALTER TABLE sale_events ADD COLUMN IF NOT EXISTS buyer_commission_percent NUMERIC NOT NULL DEFAULT 10;`);
      await client.query(`ALTER TABLE sale_events ADD COLUMN IF NOT EXISTS additional_discount_percent NUMERIC NOT NULL DEFAULT 0;`);
      await client.query(`ALTER TABLE sale_events ADD COLUMN IF NOT EXISTS display_currency TEXT NOT NULL DEFAULT 'original';`);
      await client.query(`ALTER TABLE sale_events ADD COLUMN IF NOT EXISTS uah_bank TEXT;`);
      await client.query(`ALTER TABLE sale_events ADD COLUMN IF NOT EXISTS uah_rate NUMERIC;`);
      // One-time migration: products.id alone used to be the primary key (one row per SKU,
      // globally). Multiple concurrently-live campaigns per brand means the same SKU can now
      // have one row per campaign it's live in, so the key widens to (id, sale_event_id).
      await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_event_id INTEGER;`);
      await client.query(`
        INSERT INTO sale_events (sale_id, name, end_date, active)
        SELECT DISTINCT p.sale_id, initcap(p.sale_id) || ' 1', sw.end_date, COALESCE(sw.active, true)
        FROM products p
        LEFT JOIN sale_windows sw ON sw.sale_id = p.sale_id
        WHERE p.sale_event_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM sale_events se WHERE se.sale_id = p.sale_id)
      `);
      await client.query(`
        UPDATE products p SET sale_event_id = se.id
        FROM sale_events se
        WHERE p.sale_event_id IS NULL AND se.sale_id = p.sale_id
      `);
      await client.query(`ALTER TABLE products ALTER COLUMN sale_event_id SET NOT NULL;`);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.key_column_usage
            WHERE table_name = 'products' AND constraint_name = 'products_pkey' AND column_name = 'sale_event_id'
          ) THEN
            ALTER TABLE products DROP CONSTRAINT products_pkey;
            ALTER TABLE products ADD PRIMARY KEY (id, sale_event_id);
          END IF;
        END $$;
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS products_sale_event_idx ON products (sale_event_id);
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
      await client.query(`ALTER TABLE product_events ADD COLUMN IF NOT EXISTS order_id TEXT;`);
      await client.query(`ALTER TABLE product_events ADD COLUMN IF NOT EXISTS quantity INTEGER;`);
      await client.query(`ALTER TABLE product_events ADD COLUMN IF NOT EXISTS unit_price NUMERIC;`);
      await client.query(`
        CREATE INDEX IF NOT EXISTS product_events_order_lookup ON product_events (order_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS product_events_created_at ON product_events (created_at);
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
        CREATE TABLE IF NOT EXISTS banners (
          id SERIAL PRIMARY KEY,
          image_url TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          subtitle TEXT NOT NULL DEFAULT '',
          link_category_id TEXT,
          link_sale_id TEXT,
          link_url TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`ALTER TABLE banners ADD COLUMN IF NOT EXISTS link_sale_id TEXT;`);
      await client.query(`ALTER TABLE banners ADD COLUMN IF NOT EXISTS link_url TEXT;`);
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
      // Site-wide display currency — one row, applies to every product regardless of which sale
      // campaign it's in (see api/_lib/siteSettings.ts). buyer_commission_percent /
      // additional_discount_percent stay per-campaign on sale_events; only currency is global —
      // changing it here reprices every product in one sweep (api/sales.ts's `global=1` branch).
      // sale_events.display_currency/uah_bank/uah_rate (added, then superseded by this table in
      // the same feature's follow-up) are left in place unused rather than dropped — same
      // don't-drop-columns-on-live-data precedent as sale_windows above.
      await client.query(`
        CREATE TABLE IF NOT EXISTS site_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          display_currency TEXT NOT NULL DEFAULT 'original',
          uah_bank TEXT,
          uah_rate NUMERIC,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK (id = 1)
        );
      `);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export { db };
