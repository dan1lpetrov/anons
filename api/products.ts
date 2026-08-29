import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { VercelPoolClient } from '@vercel/postgres';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';

interface PriceHistoryInput {
  id: string;
  price: number;
  colors: Array<{ id?: unknown; price?: unknown }>;
}

async function recordPriceChanges(client: VercelPoolClient, products: PriceHistoryInput[]) {
  const entries = products.flatMap((p) =>
    p.colors
      .filter((c): c is { id: string; price?: number } => typeof c?.id === 'string')
      .map((c) => ({
        productId: p.id,
        colorId: c.id,
        price: typeof c.price === 'number' ? c.price : p.price,
      })),
  );
  if (entries.length === 0) return;

  const productIds = [...new Set(entries.map((e) => e.productId))];
  const { rows } = await client.query<{ product_id: string; color_id: string; price: string }>(
    `SELECT DISTINCT ON (product_id, color_id) product_id, color_id, price
     FROM price_history
     WHERE product_id = ANY($1::text[])
     ORDER BY product_id, color_id, recorded_at DESC`,
    [productIds],
  );
  const lastPrice = new Map(rows.map((r) => [`${r.product_id}:${r.color_id}`, Number(r.price)]));

  const changed = entries.filter((e) => lastPrice.get(`${e.productId}:${e.colorId}`) !== e.price);
  if (changed.length === 0) return;

  const values: unknown[] = [];
  const placeholders = changed.map((e, i) => {
    const base = i * 3;
    values.push(e.productId, e.colorId, e.price);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });
  await client.query(
    `INSERT INTO price_history (product_id, color_id, price) VALUES ${placeholders.join(',')}`,
    values,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method === 'GET') return handleGet(res);
  if (req.method === 'POST') return handlePost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: VercelResponse) {
  try {
    // A SKU can be live in more than one campaign at once (see CLAUDE.md's sales-lifecycle
    // note) — DISTINCT ON collapses that to one row per product id, keeping the cheapest active
    // price, before the outer query applies the usual score/featured-rank ordering.
    const { rows } = await db.query<{ data: unknown }>(`
      SELECT d.data
      FROM (
        SELECT DISTINCT ON (p.id) p.id, p.data, p.featured_rank
        FROM products p
        JOIN sale_events se ON se.id = p.sale_event_id
        WHERE se.active IS NOT FALSE
          AND (se.end_date IS NULL OR se.end_date > now())
        ORDER BY p.id, (p.data->>'price')::numeric ASC
      ) d
      LEFT JOIN product_scores s ON s.product_id = d.id
      ORDER BY s.score DESC NULLS LAST, d.featured_rank ASC, d.id ASC
    `);
    // Score only changes on the cron cadence (see CLAUDE.md), so this can be cached briefly
    // instead of the max-age=0 the old featured_rank-only ordering needed.
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json(rows.map((row) => row.data));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити товари' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const body = req.body ?? {};
  const products = body.products;
  const saleEventId = body.saleEventId;

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'products має бути непорожнім масивом товарів' });
  }
  if (typeof saleEventId !== 'number') {
    return res.status(400).json({ error: 'saleEventId обовʼязковий — створи кампанію через POST /api/sales' });
  }

  for (const p of products) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.price !== 'number' ||
      typeof p.categoryId !== 'string' ||
      typeof p.saleId !== 'string' ||
      !Array.isArray(p.sizes) ||
      !Array.isArray(p.colors)
    ) {
      return res.status(400).json({
        error: 'Кожен товар має містити id, name, price, categoryId, saleId, sizes[], colors[]',
      });
    }
  }

  const client = await db.connect();
  try {
    const { rows: eventRows } = await client.query<{ sale_id: string }>('SELECT sale_id FROM sale_events WHERE id = $1', [
      saleEventId,
    ]);
    if (eventRows.length === 0) {
      return res.status(400).json({ error: 'Розпродаж (кампанія) не знайдено' });
    }
    const brand = eventRows[0].sale_id;
    if (products.some((p) => p.saleId !== brand)) {
      return res.status(400).json({ error: `Усі товари в цьому завантаженні мають належати бренду "${brand}"` });
    }

    await client.query('BEGIN');
    await recordPriceChanges(client, products);

    // Never truncates or deletes — a product is inserted if it's new to this campaign, or its
    // price/data updated in place if the same SKU is re-uploaded into the SAME campaign. Other
    // campaigns' rows (including other campaigns of the same brand, or this SKU in one of them)
    // are never touched by an upload.
    const values: unknown[] = [];
    const rows = products.map((p, i) => {
      const base = i * 6;
      values.push(p.id, p.categoryId, p.saleId, saleEventId, p.featuredRank ?? 0, JSON.stringify(p));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`;
    });
    await client.query(
      `INSERT INTO products (id, category_id, sale_id, sale_event_id, featured_rank, data)
       VALUES ${rows.join(',')}
       ON CONFLICT (id, sale_event_id) DO UPDATE SET
         category_id = EXCLUDED.category_id,
         featured_rank = EXCLUDED.featured_rank,
         data = EXCLUDED.data,
         updated_at = now()`,
      values,
    );

    await client.query('COMMIT');
    return res.status(200).json({ ok: true, count: products.length, uploadedBy: email });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти товари' });
  } finally {
    client.release();
  }
}
