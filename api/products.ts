import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method === 'GET') return handleGet(res);
  if (req.method === 'POST') return handlePost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: VercelResponse) {
  try {
    const { rows } = await db.query<{ data: unknown }>(`
      SELECT p.data
      FROM products p
      LEFT JOIN sale_windows w ON w.sale_id = p.sale_id
      WHERE w.active IS NOT FALSE
        AND (w.end_date IS NULL OR w.end_date > now())
      ORDER BY p.featured_rank ASC, p.id ASC
    `);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
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
  const endDate = body.endDate ?? null;

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'products має бути непорожнім масивом товарів' });
  }
  if (endDate !== null && typeof endDate !== 'string') {
    return res.status(400).json({ error: 'endDate має бути рядком дати або null' });
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
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE products');

    const values: unknown[] = [];
    const rows = products.map((p, i) => {
      const base = i * 5;
      values.push(p.id, p.categoryId, p.saleId, p.featuredRank ?? 0, JSON.stringify(p));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`;
    });
    await client.query(
      `INSERT INTO products (id, category_id, sale_id, featured_rank, data) VALUES ${rows.join(',')}`,
      values,
    );

    if (endDate) {
      const saleIds = [...new Set(products.map((p) => p.saleId as string))];
      for (const saleId of saleIds) {
        await client.query(
          `INSERT INTO sale_windows (sale_id, end_date, active, updated_at)
           VALUES ($1, $2, true, now())
           ON CONFLICT (sale_id) DO UPDATE SET end_date = $2, active = true, updated_at = now()`,
          [saleId, endDate],
        );
      }
    }

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
