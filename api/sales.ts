import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';

// Mirrors the SaleId brand enum from src/types (see CLAUDE.md's "saleId is a closed brand
// enum" note) — used only to generate a readable default campaign name.
const BRAND_NAMES: Record<string, string> = {
  nike: 'Nike',
  adidas: 'Adidas',
  puma: 'Puma',
};

interface SaleEventRow {
  id: number;
  sale_id: string;
  name: string;
  end_date: string | null;
  active: boolean;
  product_count: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const saleId = typeof req.query.saleId === 'string' ? req.query.saleId : undefined;

  try {
    const { rows } = await db.query<SaleEventRow>(
      `SELECT se.id, se.sale_id, se.name, se.end_date, se.active, COUNT(p.id) AS product_count
       FROM sale_events se
       LEFT JOIN products p ON p.sale_event_id = se.id
       ${saleId ? 'WHERE se.sale_id = $1' : ''}
       GROUP BY se.id
       ORDER BY se.sale_id, se.end_date ASC NULLS LAST, se.id ASC`,
      saleId ? [saleId] : [],
    );

    return res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        saleId: r.sale_id,
        name: r.name,
        endDate: r.end_date,
        active: r.active,
        productCount: Number(r.product_count),
      })),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити розпродажі' });
  }
}

async function nextCampaignName(saleId: string): Promise<string> {
  const { rows } = await db.query<{ name: string }>('SELECT name FROM sale_events WHERE sale_id = $1', [saleId]);
  const taken = new Set(rows.map((r) => r.name));
  const base = BRAND_NAMES[saleId] ?? saleId;
  let n = rows.length + 1;
  let candidate = `${base} ${n}`;
  while (taken.has(candidate)) {
    n++;
    candidate = `${base} ${n}`;
  }
  return candidate;
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = req.body ?? {};
  const { id, saleId, name, endDate, active } = body;

  if (endDate !== undefined && endDate !== null && typeof endDate !== 'string') {
    return res.status(400).json({ error: 'endDate має бути рядком дати або null' });
  }

  try {
    if (id !== undefined) {
      // Update an existing campaign — rename / change end date / pause-resume, independently
      // of any other campaign for the same brand.
      if (typeof id !== 'number') {
        return res.status(400).json({ error: 'id має бути числом' });
      }
      const { rows } = await db.query<{ id: number }>(
        `UPDATE sale_events
         SET name = COALESCE($2, name),
             end_date = CASE WHEN $3::boolean THEN $4 ELSE end_date END,
             active = COALESCE($5, active),
             updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [id, typeof name === 'string' && name.trim() ? name.trim() : null, endDate !== undefined, endDate ?? null, typeof active === 'boolean' ? active : null],
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Розпродаж не знайдено' });
      return res.status(200).json({ ok: true, id: rows[0].id });
    }

    // Create a new campaign.
    if (typeof saleId !== 'string' || !saleId) {
      return res.status(400).json({ error: 'saleId обовʼязковий' });
    }
    const resolvedName = typeof name === 'string' && name.trim() ? name.trim() : await nextCampaignName(saleId);
    const { rows } = await db.query<{ id: number; name: string }>(
      `INSERT INTO sale_events (sale_id, name, end_date, active)
       VALUES ($1, $2, $3, true)
       RETURNING id, name`,
      [saleId, resolvedName, endDate ?? null],
    );
    return res.status(200).json({ ok: true, id: rows[0].id, name: rows[0].name });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти розпродаж' });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const idParam = typeof req.query.id === 'string' ? Number(req.query.id) : NaN;

  if (!Number.isInteger(idParam)) {
    return res.status(400).json({ error: 'id обовʼязковий' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('DELETE FROM products WHERE sale_event_id = $1', [idParam]);
    await client.query('DELETE FROM sale_events WHERE id = $1', [idParam]);
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, removedProducts: rowCount });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося видалити розпродаж' });
  } finally {
    client.release();
  }
}
