import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';
import { recordPriceChanges, repriceProductData, type ProductData, type SaleConditions } from './_lib/pricing.js';
import { getSiteCurrency } from './_lib/siteSettings.js';
import {
  fetchProductById,
  fetchProductsByIds,
  purgeProductsCache,
  setProductsCacheHeaders,
} from './_lib/productQueries.js';

const MAX_PAGE_SIZE = 60;
const DEFAULT_PAGE_SIZE = 24;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

function csvParam(value: unknown): string[] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const list = value.split(',').map((v) => v.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const idParam = req.query.id;
  if (typeof idParam === 'string' && idParam) {
    try {
      const product = await fetchProductById(idParam);
      setProductsCacheHeaders(res);
      if (!product) return res.status(404).json({ error: 'Товар не знайдено' });
      return res.status(200).json(product);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Не вдалося завантажити товар' });
    }
  }

  const idsParam = csvParam(req.query.ids);
  if (idsParam) {
    try {
      const products = await fetchProductsByIds(idsParam);
      setProductsCacheHeaders(res);
      return res.status(200).json(products);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Не вдалося завантажити товари' });
    }
  }

  if (req.query.meta === '1') return handleGetMeta(res);

  return handleGetList(req, res);
}

// One representative image + the distinct sizes present per category — small enough (one row
// per category, not per product) to compute on every request without needing its own cache
// bucket. Powers Home's category tiles and Catalog's size-facet chips (the client re-runs the
// existing sizeKindForCategory/splitTallSizes/sortSizes bucketing over this — see
// src/utils/catalog.ts — instead of duplicating that logic in SQL).
async function handleGetMeta(res: VercelResponse) {
  try {
    const { rows } = await db.query<{ categoryId: string; image: string | null; sizes: string[] | null }>(`
      SELECT p.category_id AS "categoryId",
             (array_agg(p.data->>'image'))[1] AS image,
             array_agg(DISTINCT size_elem) FILTER (WHERE size_elem IS NOT NULL) AS sizes
      FROM products p
      JOIN sale_events se ON se.id = p.sale_event_id
      LEFT JOIN LATERAL jsonb_array_elements_text(p.data->'sizes') AS size_elem ON true
      WHERE se.active IS NOT FALSE
        AND (se.end_date IS NULL OR se.end_date > now())
      GROUP BY p.category_id
    `);
    setProductsCacheHeaders(res);
    return res.status(200).json({
      categories: rows.map((r) => ({ id: r.categoryId, image: r.image })),
      sizesByCategory: Object.fromEntries(rows.map((r) => [r.categoryId, r.sizes ?? []])),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити категорії' });
  }
}

// Server-side pagination/filtering/sorting for the catalog — replaces what used to be a
// client-side filter over the entire catalog (see CatalogRoute.tsx). Home also hits this branch
// (no filters, small pageSize) for its top-N row instead of getting its own endpoint.
async function handleGetList(req: VercelRequest, res: VercelResponse) {
  const category = typeof req.query.category === 'string' && req.query.category !== 'all' ? req.query.category : null;
  const brands = csvParam(req.query.brands);
  const sizes = csvParam(req.query.sizes);
  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  // Escape ILIKE wildcards in user input so e.g. a literal "%" or "_" in a search term is matched
  // literally instead of acting as a pattern wildcard.
  const searchLike = rawQuery ? `%${rawQuery.replace(/[%_]/g, (c) => `\\${c}`)}%` : null;
  const sort = req.query.sort === 'price-asc' || req.query.sort === 'price-desc' ? req.query.sort : 'recommended';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const orderBy =
    sort === 'price-asc'
      ? `(d.data->>'price')::numeric ASC`
      : sort === 'price-desc'
        ? `(d.data->>'price')::numeric DESC`
        : `s.score DESC NULLS LAST, d.featured_rank ASC, d.id ASC`;

  try {
    // Projects only what ProductCard actually renders (see src/types/index.ts's ProductCardData)
    // instead of the full stored blob — every color's full images[]/sizes[]/description/etc. would
    // otherwise ride along on every catalog page view for data nothing on this screen displays;
    // the full Product is fetched separately (GET ?id=) once someone opens a product.
    const { rows } = await db.query<{ card: unknown; total_count: string }>(
      `
      WITH filtered AS (
        SELECT DISTINCT ON (p.id) p.id, p.data, p.featured_rank
        FROM products p
        JOIN sale_events se ON se.id = p.sale_event_id
        WHERE se.active IS NOT FALSE
          AND (se.end_date IS NULL OR se.end_date > now())
          AND ($1::text IS NULL OR p.category_id = $1)
          AND ($2::text[] IS NULL OR p.sale_id = ANY($2))
          AND ($3::text[] IS NULL OR p.data->'sizes' ?| $3)
          AND ($4::text IS NULL OR p.data->>'name' ILIKE $4 ESCAPE '\\' OR p.data->>'description' ILIKE $4 ESCAPE '\\')
        ORDER BY p.id, (p.data->>'price')::numeric ASC
      )
      SELECT
        jsonb_build_object(
          'id', d.id,
          'name', d.data->>'name',
          'image', d.data->>'image',
          'sourceName', d.data->>'sourceName',
          'currency', d.data->>'currency',
          'price', (d.data->>'price')::numeric,
          'originalPrice', (d.data->>'originalPrice')::numeric,
          'colors', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'price', (c->>'price')::numeric,
              'originalPrice', (c->>'originalPrice')::numeric
            ))
            FROM jsonb_array_elements(d.data->'colors') AS c
          ), '[]'::jsonb)
        ) AS card,
        count(*) OVER() AS total_count
      FROM filtered d
      LEFT JOIN product_scores s ON s.product_id = d.id
      ORDER BY ${orderBy}
      LIMIT $5 OFFSET $6
      `,
      [category, brands, sizes, searchLike, pageSize, offset],
    );
    setProductsCacheHeaders(res);
    return res.status(200).json({
      products: rows.map((row) => row.card),
      totalCount: rows.length > 0 ? Number(rows[0].total_count) : 0,
    });
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
      typeof p.basePrice !== 'number' ||
      typeof p.categoryId !== 'string' ||
      typeof p.saleId !== 'string' ||
      !Array.isArray(p.sizes) ||
      !Array.isArray(p.colors)
    ) {
      return res.status(400).json({
        error: 'Кожен товар має містити id, name, basePrice, categoryId, saleId, sizes[], colors[]',
      });
    }
  }

  const client = await db.connect();
  try {
    const { rows: eventRows } = await client.query<{
      sale_id: string;
      buyer_commission_percent: string;
      additional_discount_percent: string;
    }>('SELECT sale_id, buyer_commission_percent, additional_discount_percent FROM sale_events WHERE id = $1', [saleEventId]);
    if (eventRows.length === 0) {
      return res.status(400).json({ error: 'Розпродаж (кампанія) не знайдено' });
    }
    const brand = eventRows[0].sale_id;
    if (products.some((p) => p.saleId !== brand)) {
      return res.status(400).json({ error: `Усі товари в цьому завантаженні мають належати бренду "${brand}"` });
    }

    // The price shown/sold is always derived from basePrice + this campaign's commission/
    // discount + the site's current display currency — never trusted from the client, so it
    // can't drift out of sync with a conditions edit made after the client loaded the page.
    const conditions: SaleConditions = {
      buyerCommissionPercent: Number(eventRows[0].buyer_commission_percent),
      additionalDiscountPercent: Number(eventRows[0].additional_discount_percent),
    };
    const currency = await getSiteCurrency(client);
    const priced: (ProductData & Record<string, unknown>)[] = products.map((p) => repriceProductData(p, conditions, currency));

    // price_history tracks basePrice × (1 − discount%) × (1 + commission%) — before FX
    // conversion — so a currency/rate change never counts as a "price change" for history (see
    // the matching NO_FX note in api/sales.ts's repriceProducts).
    const historyPriced = products.map((p) => repriceProductData(p, conditions, { displayCurrency: 'original', uahRate: null }));

    await client.query('BEGIN');
    await recordPriceChanges(
      client,
      historyPriced.map((p) => ({ id: p.id as string, price: p.price as number, colors: p.colors ?? [] })),
    );

    // Never truncates or deletes — a product is inserted if it's new to this campaign, or its
    // price/data updated in place if the same SKU is re-uploaded into the SAME campaign. Other
    // campaigns' rows (including other campaigns of the same brand, or this SKU in one of them)
    // are never touched by an upload.
    const values: unknown[] = [];
    const rows = priced.map((p, i) => {
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
    await purgeProductsCache();
    return res.status(200).json({ ok: true, count: products.length, uploadedBy: email });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти товари' });
  } finally {
    client.release();
  }
}
