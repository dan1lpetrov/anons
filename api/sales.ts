import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { VercelPoolClient } from '@vercel/postgres';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';
import { fetchUsdUahRate, NAMED_BANKS, type NamedBank } from './_lib/exchangeRates.js';
import {
  recordPriceChanges,
  repriceProductData,
  type DisplayCurrency,
  type ProductData,
  type SaleConditions,
} from './_lib/pricing.js';
import { getSiteCurrency, setSiteCurrency, type SiteCurrency } from './_lib/siteSettings.js';

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
  buyer_commission_percent: string;
  additional_discount_percent: string;
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
  const fetchRate = req.query.fetchRate;
  if (typeof fetchRate === 'string') {
    if (!NAMED_BANKS.includes(fetchRate as NamedBank)) {
      return res.status(400).json({ error: `fetchRate підтримує лише: ${NAMED_BANKS.join(', ')}` });
    }
    try {
      const rate = await fetchUsdUahRate(fetchRate as NamedBank);
      return res.status(200).json({ rate });
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: `Не вдалося отримати курс ${fetchRate}` });
    }
  }

  // The site-wide display currency (see api/_lib/siteSettings.ts) — not tied to any one
  // campaign, so it's its own branch rather than a field on a particular sale row.
  if (req.query.global === '1') {
    try {
      return res.status(200).json(await getSiteCurrency());
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Не вдалося завантажити валюту сайту' });
    }
  }

  const saleId = typeof req.query.saleId === 'string' ? req.query.saleId : undefined;

  try {
    const { rows } = await db.query<SaleEventRow>(
      `SELECT se.id, se.sale_id, se.name, se.end_date, se.active, COUNT(p.id) AS product_count,
              se.buyer_commission_percent, se.additional_discount_percent
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
        buyerCommissionPercent: Number(r.buyer_commission_percent),
        additionalDiscountPercent: Number(r.additional_discount_percent),
      })),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити розпродажі' });
  }
}

type ResolveResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

// Shared by create (POST without id) and edit (POST with id) — an edit always sends the whole
// commission/discount pair together (see admin-sales.html), never a partial patch, so reusing
// create's "default when missing" behavior here doesn't risk silently zeroing out a field the
// admin didn't mean to touch.
function resolveConditions(body: Record<string, unknown>): ResolveResult<SaleConditions> {
  const { buyerCommissionPercent, additionalDiscountPercent } = body;

  const commission = buyerCommissionPercent === undefined ? 10 : Number(buyerCommissionPercent);
  if (!Number.isFinite(commission) || commission < 0) {
    return { ok: false, status: 400, error: 'Комісія баєра має бути невідʼємним числом' };
  }
  const discount = additionalDiscountPercent === undefined ? 0 : Number(additionalDiscountPercent);
  if (!Number.isFinite(discount) || discount < 0) {
    return { ok: false, status: 400, error: 'Додаткова знижка має бути невідʼємним числом' };
  }

  return { ok: true, value: { buyerCommissionPercent: commission, additionalDiscountPercent: discount } };
}

// Shared by the global-currency GET/POST branch — resolves+validates a target SiteCurrency.
// Named banks (mono/privat) always re-fetch a fresh rate right now, ignoring anything the client
// sent for uahRate — the whole point is "post/save with the actual current rate," not whatever
// was showing in a form that might be minutes stale by the time it's submitted. uahBank absent
// or null means "власний курс" (custom), which is the opposite: always the admin-typed number,
// never auto-fetched.
async function resolveSiteCurrency(body: Record<string, unknown>): Promise<ResolveResult<SiteCurrency>> {
  const { displayCurrency, uahBank, uahRate } = body;

  const currency = displayCurrency === undefined ? 'original' : displayCurrency;
  if (currency !== 'original' && currency !== 'uah') {
    return { ok: false, status: 400, error: 'displayCurrency має бути "original" або "uah"' };
  }
  if (currency === 'original') {
    return { ok: true, value: { displayCurrency: 'original', uahBank: null, uahRate: null } };
  }

  if (uahBank !== null && uahBank !== undefined && !NAMED_BANKS.includes(uahBank as NamedBank)) {
    return { ok: false, status: 400, error: `uahBank має бути одним з: ${NAMED_BANKS.join(', ')}, або не вказаний (власний курс)` };
  }

  if (uahBank === null || uahBank === undefined) {
    const manualRate = Number(uahRate);
    if (!Number.isFinite(manualRate) || manualRate <= 0) {
      return { ok: false, status: 400, error: 'Для власного курсу треба вказати додатне число' };
    }
    return { ok: true, value: { displayCurrency: 'uah', uahBank: null, uahRate: manualRate } };
  }

  const bank = uahBank as NamedBank;
  try {
    const rate = await fetchUsdUahRate(bank);
    return { ok: true, value: { displayCurrency: 'uah', uahBank: bank, uahRate: rate } };
  } catch (error) {
    console.error(error);
    return { ok: false, status: 502, error: `Не вдалося отримати курс ${bank}. Спробуй ще раз.` };
  }
}

// price_history tracks basePrice × (1 − discount%) × (1 + commission%) — the price *before* FX
// conversion — never the currency-converted display price. A USD/UAH rate can move on its own
// (see fetchUsdUahRate) independently of anything actually changing about the product or the
// deal, and re-logging every product's history on every rate tick is exactly the noise this
// avoids: history only grows when basePrice or the campaign's discount/commission actually move.
const NO_FX: DisplayCurrency = { displayCurrency: 'original', uahRate: null };

// Re-derives price/originalPrice for a set of products from their stored basePrice/
// baseOriginalPrice, under a (possibly just-changed) set of per-product conditions — shared by
// the per-campaign edit path (one sale's commission/discount changed) and the global-currency
// sweep (every product's display currency changed, each keeping its own campaign's commission/
// discount). Only writes price_history when the pre-FX price actually changed (see NO_FX above).
async function repriceProducts(
  client: VercelPoolClient,
  rows: Array<{ id: string; saleEventId: number; data: ProductData; conditions: SaleConditions }>,
  currency: SiteCurrency,
): Promise<number> {
  if (rows.length === 0) return 0;

  const repriced = rows.map((r) => ({
    id: r.id,
    saleEventId: r.saleEventId,
    data: repriceProductData(r.data, r.conditions, currency),
    historyData: repriceProductData(r.data, r.conditions, NO_FX),
  }));

  await recordPriceChanges(
    client,
    repriced.map((r) => ({
      id: r.id,
      price: r.historyData.price as number,
      colors: r.historyData.colors ?? [],
    })),
  );

  // The primary key is (id, sale_event_id) — the same SKU can be live in more than one campaign
  // at once (see CLAUDE.md), each with its own conditions and thus its own repriced `data`, so
  // the join has to match both columns or two campaigns' rows for the same id would collide.
  const values: unknown[] = [];
  const placeholders = repriced.map((r, i) => {
    const base = i * 3;
    values.push(r.id, r.saleEventId, JSON.stringify(r.data));
    return `($${base + 1}, $${base + 2}::integer, $${base + 3}::jsonb)`;
  });
  await client.query(
    `UPDATE products SET data = v.data, updated_at = now()
     FROM (VALUES ${placeholders.join(',')}) AS v(id, sale_event_id, data)
     WHERE products.id = v.id AND products.sale_event_id = v.sale_event_id`,
    values,
  );
  return repriced.length;
}

async function repriceCampaignProducts(client: VercelPoolClient, saleEventId: number, cond: SaleConditions): Promise<number> {
  const { rows } = await client.query<{ id: string; data: ProductData }>('SELECT id, data FROM products WHERE sale_event_id = $1', [
    saleEventId,
  ]);
  const currency = await getSiteCurrency(client);
  return repriceProducts(
    client,
    rows.map((r) => ({ id: r.id, saleEventId, data: r.data, conditions: cond })),
    currency,
  );
}

// Triggered when the global display currency changes — every product, across every campaign,
// needs its price recomputed (each still under its own campaign's commission/discount).
async function repriceAllProducts(client: VercelPoolClient, currency: SiteCurrency): Promise<number> {
  const { rows } = await client.query<{
    id: string;
    sale_event_id: number;
    data: ProductData;
    buyer_commission_percent: string;
    additional_discount_percent: string;
  }>(
    `SELECT p.id, p.sale_event_id, p.data, se.buyer_commission_percent, se.additional_discount_percent
     FROM products p
     JOIN sale_events se ON se.id = p.sale_event_id`,
  );
  return repriceProducts(
    client,
    rows.map((r) => ({
      id: r.id,
      saleEventId: r.sale_event_id,
      data: r.data,
      conditions: {
        buyerCommissionPercent: Number(r.buyer_commission_percent),
        additionalDiscountPercent: Number(r.additional_discount_percent),
      },
    })),
    currency,
  );
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

  if (body.global === true) return handlePostGlobal(body, res);

  const { id, saleId, name, endDate, active, buyerCommissionPercent, additionalDiscountPercent } = body;

  if (endDate !== undefined && endDate !== null && typeof endDate !== 'string') {
    return res.status(400).json({ error: 'endDate має бути рядком дати або null' });
  }

  // A conditions edit always sends the whole commission/discount pair together (see
  // admin-sales.html) — a plain rename/date/pause save from the existing controls never
  // includes these fields, so this flag is how we tell the two apart and only pay for
  // repricing when actually asked.
  const conditionsProvided = buyerCommissionPercent !== undefined || additionalDiscountPercent !== undefined;

  try {
    if (id !== undefined) {
      // Update an existing campaign — rename / change end date / pause-resume / edit conditions,
      // independently of any other campaign for the same brand.
      if (typeof id !== 'number') {
        return res.status(400).json({ error: 'id має бути числом' });
      }

      let resolved: SaleConditions | null = null;
      if (conditionsProvided) {
        const result = resolveConditions(body);
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        resolved = result.value;
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<{ id: number }>(
          `UPDATE sale_events
           SET name = COALESCE($2, name),
               end_date = CASE WHEN $3::boolean THEN $4 ELSE end_date END,
               active = COALESCE($5, active),
               buyer_commission_percent = CASE WHEN $6::boolean THEN $7 ELSE buyer_commission_percent END,
               additional_discount_percent = CASE WHEN $6::boolean THEN $8 ELSE additional_discount_percent END,
               updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [
            id,
            typeof name === 'string' && name.trim() ? name.trim() : null,
            endDate !== undefined,
            endDate ?? null,
            typeof active === 'boolean' ? active : null,
            conditionsProvided,
            resolved?.buyerCommissionPercent ?? null,
            resolved?.additionalDiscountPercent ?? null,
          ],
        );
        if (rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Розпродаж не знайдено' });
        }

        let repricedCount = 0;
        if (conditionsProvided && resolved) {
          repricedCount = await repriceCampaignProducts(client, id, resolved);
        }

        await client.query('COMMIT');
        return res.status(200).json({ ok: true, id: rows[0].id, ...(conditionsProvided ? { ...resolved, repricedCount } : {}) });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    // Create a new campaign.
    if (typeof saleId !== 'string' || !saleId) {
      return res.status(400).json({ error: 'saleId обовʼязковий' });
    }
    const resolvedName = typeof name === 'string' && name.trim() ? name.trim() : await nextCampaignName(saleId);

    const result = resolveConditions(body);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const conditions = result.value;

    const { rows } = await db.query<{ id: number; name: string }>(
      `INSERT INTO sale_events (sale_id, name, end_date, active, buyer_commission_percent, additional_discount_percent)
       VALUES ($1, $2, $3, true, $4, $5)
       RETURNING id, name`,
      [saleId, resolvedName, endDate ?? null, conditions.buyerCommissionPercent, conditions.additionalDiscountPercent],
    );
    return res.status(200).json({ ok: true, id: rows[0].id, name: rows[0].name, ...conditions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти розпродаж' });
  }
}

// Editing the site-wide display currency reprices every product on the site in one sweep — a
// much bigger write than a single campaign's edit, but this action is admin-triggered and rare
// (currency doesn't change often), so a full-table pass is the simplest correct approach.
async function handlePostGlobal(body: Record<string, unknown>, res: VercelResponse) {
  const result = await resolveSiteCurrency(body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  const currency = result.value;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await setSiteCurrency(currency, client);
    const repricedCount = await repriceAllProducts(client, currency);
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, ...currency, repricedCount });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти валюту сайту' });
  } finally {
    client.release();
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
