import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';

interface SaleWindowRow {
  sale_id: string;
  end_date: string | null;
  active: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  if (req.method === 'GET') return handleGet(res);
  if (req.method === 'POST') return handlePost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: VercelResponse) {
  try {
    const [{ rows: productSales }, { rows: windows }] = await Promise.all([
      db.query<{ sale_id: string }>('SELECT DISTINCT sale_id FROM products'),
      db.query<SaleWindowRow>('SELECT sale_id, end_date, active FROM sale_windows'),
    ]);

    const windowMap = new Map(windows.map((w) => [w.sale_id, w]));
    const saleIds = new Set([...productSales.map((p) => p.sale_id), ...windows.map((w) => w.sale_id)]);

    const result = [...saleIds].sort().map((saleId) => {
      const w = windowMap.get(saleId);
      return { saleId, endDate: w?.end_date ?? null, active: w?.active ?? true };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити розпродажі' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { saleId, endDate, active } = req.body ?? {};

  if (typeof saleId !== 'string' || !saleId) {
    return res.status(400).json({ error: 'saleId обовʼязковий' });
  }
  if (endDate !== null && typeof endDate !== 'string') {
    return res.status(400).json({ error: 'endDate має бути рядком дати або null' });
  }
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active має бути true/false' });
  }

  try {
    await db.query(
      `INSERT INTO sale_windows (sale_id, end_date, active, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (sale_id) DO UPDATE SET end_date = $2, active = $3, updated_at = now()`,
      [saleId, endDate, active],
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти розпродаж' });
  }
}
