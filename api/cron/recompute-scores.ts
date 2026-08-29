import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from '../_lib/db.js';
import { effectiveOriginalPrice, effectivePrice, type ProductData } from '../_lib/pricing.js';
import { requireAdmin } from '../_lib/session.js';
import { getWeights } from '../_lib/weights.js';

const TRENDING_WINDOW_HOURS = 48;
const TOP_SIMILAR_PER_PRODUCT = 10;

async function isAuthorized(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  // Vercel Cron sends this header automatically when a CRON_SECRET env var is configured on the project.
  if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true;
  const email = await requireAdmin(req, res); // writes its own 401 on failure
  return Boolean(email);
}

// Ranks values 0..1 within the given set; higher raw value -> higher rank. Products absent from
// `values` (no data for this signal) are left out of the map entirely — callers apply their own
// neutral default instead of letting "no data" silently sort as "worst".
//
// Tied values MUST get the same rank: rank(v) = (count of values strictly less than v) / (n-1).
// A naive "sort then use array position" gives ties an arbitrary distinct rank based on whatever
// order the DB happened to return rows in — with e.g. every product at 0 views right now, that
// spreads a fake 0..1 spread across a signal that actually carries zero information.
function percentileRanks(values: Map<string, number>): Map<string, number> {
  const sortedValues = [...values.values()].sort((a, b) => a - b);
  const n = sortedValues.length;
  const ranks = new Map<string, number>();
  for (const [id, v] of values) {
    if (n <= 1) {
      ranks.set(id, 1);
      continue;
    }
    let lo = 0;
    let hi = sortedValues.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedValues[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    ranks.set(id, lo / (n - 1));
  }
  return ranks;
}

async function recompute(): Promise<{ scored: number; similarPairs: number }> {
  const WEIGHTS = await getWeights();

  const { rows: products } = await db.query<{ id: string; data: ProductData }>(`
    SELECT p.id, p.data
    FROM products p
    LEFT JOIN sale_windows w ON w.sale_id = p.sale_id
    WHERE w.active IS NOT FALSE
      AND (w.end_date IS NULL OR w.end_date > now())
  `);

  if (products.length === 0) {
    await db.query('TRUNCATE TABLE product_scores');
    await db.query('TRUNCATE TABLE product_similar');
    return { scored: 0, similarPairs: 0 };
  }

  const { rows: eventCounts } = await db.query<{
    product_id: string;
    view_count: string;
    order_count: string;
    trending_count: string;
  }>(
    `SELECT product_id,
       COUNT(*) FILTER (WHERE event_type = 'view') AS view_count,
       COUNT(*) FILTER (WHERE event_type = 'order') AS order_count,
       COUNT(*) FILTER (WHERE created_at > now() - $1::interval) AS trending_count
     FROM product_events
     GROUP BY product_id`,
    [`${TRENDING_WINDOW_HOURS} hours`],
  );
  const eventsByProduct = new Map(eventCounts.map((r) => [r.product_id, r]));

  const { rows: historyStats } = await db.query<{
    product_id: string;
    color_id: string;
    median_price: string;
    point_count: string;
  }>(`
    SELECT product_id, color_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
           COUNT(*) AS point_count
    FROM price_history
    GROUP BY product_id, color_id
  `);
  const historyByColor = new Map(historyStats.map((r) => [`${r.product_id}:${r.color_id}`, r]));

  const discountRaw = new Map<string, number>();
  const priceVsHistoryRaw = new Map<string, number>();
  const viewsRaw = new Map<string, number>();
  const ordersRaw = new Map<string, number>();
  const trendingRaw = new Map<string, number>();

  for (const { id, data } of products) {
    const colors = Array.isArray(data.colors) && data.colors.length > 0 ? data.colors : [{}];

    let bestDiscount = 0;
    let bestPriceDrop: number | undefined;
    for (const color of colors) {
      const price = effectivePrice(data, color);
      const originalPrice = effectiveOriginalPrice(data, color);
      if (typeof price === 'number' && typeof originalPrice === 'number' && originalPrice > price) {
        bestDiscount = Math.max(bestDiscount, (originalPrice - price) / originalPrice);
      }

      const colorId = typeof color.id === 'string' ? color.id : null;
      const stats = colorId ? historyByColor.get(`${id}:${colorId}`) : undefined;
      if (stats && Number(stats.point_count) >= 2 && typeof price === 'number') {
        const median = Number(stats.median_price);
        if (median > price) {
          const drop = (median - price) / median;
          bestPriceDrop = bestPriceDrop === undefined ? drop : Math.max(bestPriceDrop, drop);
        }
      }
    }

    discountRaw.set(id, bestDiscount);
    if (bestPriceDrop !== undefined) priceVsHistoryRaw.set(id, bestPriceDrop);

    const events = eventsByProduct.get(id);
    viewsRaw.set(id, events ? Number(events.view_count) : 0);
    ordersRaw.set(id, events ? Number(events.order_count) : 0);
    trendingRaw.set(id, events ? Number(events.trending_count) : 0);
  }

  const discountRank = percentileRanks(discountRaw);
  const priceVsHistoryRank = percentileRanks(priceVsHistoryRaw);
  const viewsRank = percentileRanks(viewsRaw);
  const ordersRank = percentileRanks(ordersRaw);
  const trendingRank = percentileRanks(trendingRaw);

  const scores = products.map(({ id }) => {
    const score =
      WEIGHTS.discount * (discountRank.get(id) ?? 0) +
      WEIGHTS.priceVsHistory * (priceVsHistoryRank.get(id) ?? 0.5) + // no history yet: neutral, not penalized
      WEIGHTS.views * (viewsRank.get(id) ?? 0) +
      WEIGHTS.orders * (ordersRank.get(id) ?? 0) +
      WEIGHTS.trending * (trendingRank.get(id) ?? 0);
    return { id, score };
  });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE product_scores');
    const values: unknown[] = [];
    const placeholders = scores.map((s, i) => {
      values.push(s.id, s.score);
      return `($${i * 2 + 1}, $${i * 2 + 2}, now())`;
    });
    await client.query(
      `INSERT INTO product_scores (product_id, score, computed_at) VALUES ${placeholders.join(',')}`,
      values,
    );

    await client.query('TRUNCATE TABLE product_similar');
    const { rows: similarRows } = await client.query<{
      product_id: string;
      similar_product_id: string;
      weight: string;
    }>(
      `WITH orders AS (
         SELECT DISTINCT telegram_user_id, product_id
         FROM product_events
         WHERE event_type = 'order' AND telegram_user_id IS NOT NULL
       ),
       pairs AS (
         SELECT a.product_id AS product_id, b.product_id AS similar_product_id, COUNT(*) AS weight
         FROM orders a
         JOIN orders b ON a.telegram_user_id = b.telegram_user_id AND a.product_id <> b.product_id
         GROUP BY a.product_id, b.product_id
       ),
       ranked AS (
         SELECT product_id, similar_product_id, weight,
                ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY weight DESC) AS rn
         FROM pairs
       )
       SELECT product_id, similar_product_id, weight FROM ranked WHERE rn <= $1`,
      [TOP_SIMILAR_PER_PRODUCT],
    );

    if (similarRows.length > 0) {
      const simValues: unknown[] = [];
      const simPlaceholders = similarRows.map((r, i) => {
        simValues.push(r.product_id, r.similar_product_id, r.weight);
        return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`;
      });
      await client.query(
        `INSERT INTO product_similar (product_id, similar_product_id, weight) VALUES ${simPlaceholders.join(',')}`,
        simValues,
      );
    }

    await client.query('COMMIT');
    return { scored: scores.length, similarPairs: similarRows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await isAuthorized(req, res))) return;

  try {
    const result = await recompute();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося перерахувати рейтинги' });
  }
}
