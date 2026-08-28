import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from '../_lib/db.js';
import { requireAdmin } from '../_lib/session.js';

interface ProductDebugStats {
  score: number | null;
  computedAt: string | null;
  viewCount: number;
  orderCount: number;
  trendingCount: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401

  const idsParam = req.query.productIds;
  const ids = typeof idsParam === 'string' ? idsParam.split(',').filter(Boolean) : [];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'productIds є обовʼязковим (comma-separated список id)' });
  }

  try {
    const [{ rows: scoreRows }, { rows: eventRows }] = await Promise.all([
      db.query<{ product_id: string; score: string; computed_at: string }>(
        `SELECT product_id, score, computed_at FROM product_scores WHERE product_id = ANY($1::text[])`,
        [ids],
      ),
      db.query<{ product_id: string; view_count: string; order_count: string; trending_count: string }>(
        `SELECT product_id,
           COUNT(*) FILTER (WHERE event_type = 'view') AS view_count,
           COUNT(*) FILTER (WHERE event_type = 'order') AS order_count,
           COUNT(*) FILTER (WHERE created_at > now() - interval '48 hours') AS trending_count
         FROM product_events
         WHERE product_id = ANY($1::text[])
         GROUP BY product_id`,
        [ids],
      ),
    ]);

    const scoreById = new Map(scoreRows.map((r) => [r.product_id, r]));
    const eventsById = new Map(eventRows.map((r) => [r.product_id, r]));

    const result: Record<string, ProductDebugStats> = {};
    for (const id of ids) {
      const scoreRow = scoreById.get(id);
      const eventRow = eventsById.get(id);
      result[id] = {
        score: scoreRow ? Number(scoreRow.score) : null,
        computedAt: scoreRow?.computed_at ?? null,
        viewCount: Number(eventRow?.view_count ?? 0),
        orderCount: Number(eventRow?.order_count ?? 0),
        trendingCount: Number(eventRow?.trending_count ?? 0),
      };
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити діагностику товарів' });
  }
}
