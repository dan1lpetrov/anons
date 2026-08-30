import type { VercelResponse } from '@vercel/node';
import { dangerouslyDeleteByTag } from '@vercel/functions';
import { db } from './db.js';

// Shared by api/products.ts (public reads) and every write path that changes what those reads
// return (upload, campaign reprice, currency sweep, campaign delete, score recompute) — see
// CLAUDE.md-adjacent plan notes. One tag for the whole products surface (single/batch/meta/list)
// since a write can affect any of them (e.g. a reprice changes both the single-product payload
// and the list's price-sort order).
const PRODUCTS_CACHE_TAG = 'products';

// Long CDN TTL is safe only because every write purges this tag immediately — see purgeProductsCache.
export function setProductsCacheHeaders(res: VercelResponse): void {
  res.setHeader('Vercel-CDN-Cache-Control', 'public, max-age=86400');
  res.setHeader('Vercel-Cache-Tag', PRODUCTS_CACHE_TAG);
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
}

export async function purgeProductsCache(): Promise<void> {
  await dangerouslyDeleteByTag(PRODUCTS_CACHE_TAG);
}

const ACTIVE_PRODUCTS_WHERE = `
  se.active IS NOT FALSE
  AND (se.end_date IS NULL OR se.end_date > now())
`;

// Same cheapest-active-campaign-wins dedupe as GET /api/products's list query (a SKU can be live
// in more than one campaign at once — see CLAUDE.md). Used for /product/:id (api/ssr.ts's OG
// preview and the storefront's single-product fetch).
export async function fetchProductById(id: string): Promise<unknown | null> {
  const { rows } = await db.query<{ data: unknown }>(
    `SELECT p.data
     FROM products p
     JOIN sale_events se ON se.id = p.sale_event_id
     WHERE ${ACTIVE_PRODUCTS_WHERE} AND p.id = $1
     ORDER BY (p.data->>'price')::numeric ASC
     LIMIT 1`,
    [id],
  );
  return rows[0]?.data ?? null;
}

// Batch lookup for the cart — it only ever needs the handful of products actually in someone's
// cart, never the full catalog (see useCart.ts).
export async function fetchProductsByIds(ids: string[]): Promise<unknown[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{ data: unknown }>(
    `SELECT DISTINCT ON (p.id) p.data
     FROM products p
     JOIN sale_events se ON se.id = p.sale_event_id
     WHERE ${ACTIVE_PRODUCTS_WHERE} AND p.id = ANY($1)
     ORDER BY p.id, (p.data->>'price')::numeric ASC`,
    [ids],
  );
  return rows.map((r) => r.data);
}
