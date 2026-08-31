import { db, type VercelPoolClient } from '@vercel/postgres';

let schemaReady: Promise<void> | null = null;

// Arbitrary constant used only as a lock key — see the advisory-lock note below.
const SCHEMA_LOCK_KEY = 84237551;

// Bump this by 1 every time you add a new CREATE TABLE/INDEX or ALTER TABLE statement below.
// The fast path in runEnsureSchema() compares this against the value stored in Postgres and
// skips the entire DDL block below when they already match — so a statement added without
// bumping this constant will never run on any container that already has an up-to-date
// schema_meta row (which, days after the deploy, is nearly all of them). That's not a loud
// error — it's a column/table that silently doesn't exist until the next redeploy, so the
// first sign of it is a query failing against it. Bumping this is the whole point of the
// fast path existing, not an optional step.
const SCHEMA_VERSION = 2;

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

async function currentSchemaVersion(client: VercelPoolClient): Promise<number> {
  // schema_meta itself may not exist yet (pre-this-change databases, or a fresh one) — that's
  // not a real error, just "definitely needs the full migration below".
  return client
    .query<{ version: number }>('SELECT version FROM schema_meta WHERE id = 1')
    .then((r) => r.rows[0]?.version ?? 0)
    .catch(() => 0);
}

async function runEnsureSchema(): Promise<void> {
  const client = await db.connect();
  try {
    // Fast path: every cold serverless container calls ensureSchema() on its first request, and
    // each api/*.ts file is its own separate Vercel function with its own separate cold starts —
    // so without this check, every one of them independently pays the full ~25-round-trip DDL
    // chain below on every cold start, even though it's a no-op almost every time (the schema
    // only actually changes right after a deploy that adds a new migration statement). One cheap
    // SELECT here replaces that in the common case.
    if ((await currentSchemaVersion(client)) === SCHEMA_VERSION) return;

    // Every cold serverless instance calls this on its first request, so right after a deploy
    // many of them race to run the DDL below concurrently. `CREATE TABLE/INDEX IF NOT EXISTS`
    // is NOT atomic across concurrent transactions — two can both see "doesn't exist yet" and
    // both try to create it, which throws a duplicate-key error on Postgres's own pg_class
    // catalog rather than silently no-op'ing. A session advisory lock serializes those racing
    // attempts: whoever loses the race just finds everything already created and does nothing.
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);
    try {
      // Re-check after acquiring the lock — another container may have already finished the
      // migration and updated schema_meta while we were waiting for the lock.
      if ((await currentSchemaVersion(client)) === SCHEMA_VERSION) return;

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
      // Checkout is client-only (no payment processing, see CLAUDE.md) — this is the first
      // server-side record of an order, for the admin panel. telegram_user_id/username/names are
      // a snapshot from initDataUnsafe.user at checkout time, unvalidated (same trust level as
      // product_events.telegram_user_id) — acceptable while no real payment flows through this
      // app. telegram_user_id is indexed now so a future buyer-facing "my orders" read can filter
      // on it without a migration.
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          telegram_user_id TEXT,
          telegram_username TEXT,
          telegram_first_name TEXT,
          telegram_last_name TEXT,
          comment TEXT,
          currency TEXT,
          total NUMERIC NOT NULL DEFAULT 0,
          paid BOOLEAN NOT NULL DEFAULT false,
          paid_at TIMESTAMPTZ,
          redeemed BOOLEAN NOT NULL DEFAULT false,
          redeemed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);`);
      await client.query(`CREATE INDEX IF NOT EXISTS orders_telegram_user_id_idx ON orders (telegram_user_id);`);
      // Denormalized product snapshot (name/image/source) rather than a products FK — a product
      // can be deleted or its shape rewritten by a re-upload (see the two-repo pipeline note
      // above), and an order's history has to stay readable regardless of the catalog's current
      // state. Row-per-item (not a JSONB array on orders) because the admin panel needs to
      // add/remove individual lines, which is far simpler as SQL row inserts/deletes than mutating
      // a JSON array.
      await client.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id TEXT,
          product_name TEXT NOT NULL,
          product_image TEXT,
          source_name TEXT,
          source_url TEXT,
          size TEXT NOT NULL,
          color_id TEXT,
          color_name TEXT,
          quantity INTEGER NOT NULL,
          unit_price NUMERIC NOT NULL
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);`);

      // Marks the DDL above as done up to SCHEMA_VERSION so the fast path above can skip it on
      // every future cold start until that constant is bumped again.
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          id INTEGER PRIMARY KEY DEFAULT 1,
          version INTEGER NOT NULL,
          CHECK (id = 1)
        );
      `);
      await client.query(
        `INSERT INTO schema_meta (id, version) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`,
        [SCHEMA_VERSION],
      );
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export { db };
