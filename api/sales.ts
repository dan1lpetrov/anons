import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { VercelPoolClient } from '@vercel/postgres';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';
import { fetchUsdUahRate, type AutoRateBank } from './_lib/exchangeRates.js';
import { recordPriceChanges, repriceProductData, type ProductData, type SaleConditions } from './_lib/pricing.js';

const UAH_BANKS = ['mono', 'privat', 'pumb', 'sens'] as const;
type UahBank = (typeof UAH_BANKS)[number];
const AUTO_RATE_BANKS = new Set<UahBank>(['mono', 'privat']);

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
  display_currency: string;
  uah_bank: string | null;
  uah_rate: string | null;
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
    if (!AUTO_RATE_BANKS.has(fetchRate as UahBank)) {
      return res.status(400).json({ error: `fetchRate підтримує лише: ${[...AUTO_RATE_BANKS].join(', ')}` });
    }
    try {
      const rate = await fetchUsdUahRate(fetchRate as AutoRateBank);
      return res.status(200).json({ rate });
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: `Не вдалося отримати курс ${fetchRate}` });
    }
  }

  const saleId = typeof req.query.saleId === 'string' ? req.query.saleId : undefined;

  try {
    const { rows } = await db.query<SaleEventRow>(
      `SELECT se.id, se.sale_id, se.name, se.end_date, se.active, COUNT(p.id) AS product_count,
              se.buyer_commission_percent, se.additional_discount_percent, se.display_currency,
              se.uah_bank, se.uah_rate
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
        displayCurrency: r.display_currency,
        uahBank: r.uah_bank,
        uahRate: r.uah_rate === null ? null : Number(r.uah_rate),
      })),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити розпродажі' });
  }
}

type ResolveConditionsResult = { ok: true; conditions: SaleConditions & { uahBank: UahBank | null } } | { ok: false; status: number; error: string };

// Shared by create (POST without id) and edit (POST with id) — an edit always sends the full
// condition block (see admin-sales.html), never a partial patch, so reusing create's "default
// when missing" behavior here doesn't risk silently zeroing out a field the admin didn't mean
// to touch.
async function resolveConditions(body: Record<string, unknown>): Promise<ResolveConditionsResult> {
  const { buyerCommissionPercent, additionalDiscountPercent, displayCurrency, uahBank, uahRate } = body;

  const commission = buyerCommissionPercent === undefined ? 10 : Number(buyerCommissionPercent);
  if (!Number.isFinite(commission) || commission < 0) {
    return { ok: false, status: 400, error: 'Комісія баєра має бути невідʼємним числом' };
  }
  const discount = additionalDiscountPercent === undefined ? 0 : Number(additionalDiscountPercent);
  if (!Number.isFinite(discount) || discount < 0) {
    return { ok: false, status: 400, error: 'Додаткова знижка має бути невідʼємним числом' };
  }
  const currency = displayCurrency === undefined ? 'original' : displayCurrency;
  if (currency !== 'original' && currency !== 'uah') {
    return { ok: false, status: 400, error: 'displayCurrency має бути "original" або "uah"' };
  }

  let resolvedBank: UahBank | null = null;
  let resolvedRate: number | null = null;
  if (currency === 'uah') {
    if (!UAH_BANKS.includes(uahBank as UahBank)) {
      return { ok: false, status: 400, error: `uahBank має бути одним з: ${UAH_BANKS.join(', ')}` };
    }
    const bank = uahBank as UahBank;
    resolvedBank = bank;
    if (uahRate !== undefined && uahRate !== null) {
      const manualRate = Number(uahRate);
      if (!Number.isFinite(manualRate) || manualRate <= 0) {
        return { ok: false, status: 400, error: 'uahRate має бути додатним числом' };
      }
      resolvedRate = manualRate;
    } else if (AUTO_RATE_BANKS.has(bank)) {
      try {
        resolvedRate = await fetchUsdUahRate(bank as AutoRateBank);
      } catch (error) {
        console.error(error);
        return { ok: false, status: 502, error: `Не вдалося отримати курс ${bank}. Спробуй ще раз або введи курс вручну.` };
      }
    } else {
      return { ok: false, status: 400, error: `Для банку ${bank} немає публічного API курсів — введи курс вручну.` };
    }
  }

  return {
    ok: true,
    conditions: {
      buyerCommissionPercent: commission,
      additionalDiscountPercent: discount,
      displayCurrency: currency,
      uahBank: resolvedBank,
      uahRate: resolvedRate,
    },
  };
}

// Re-derives price/originalPrice for every product currently in this campaign from their stored
// basePrice/baseOriginalPrice, under the just-saved conditions — otherwise editing a campaign's
// commission/discount would leave every already-uploaded product showing its old price until the
// next manual re-upload, which is exactly the confusing gap this endpoint exists to close.
async function repriceCampaignProducts(client: VercelPoolClient, saleEventId: number, cond: SaleConditions) {
  const { rows } = await client.query<{ id: string; data: ProductData }>('SELECT id, data FROM products WHERE sale_event_id = $1', [
    saleEventId,
  ]);
  if (rows.length === 0) return 0;

  const repriced = rows.map((r) => ({ id: r.id, data: repriceProductData(r.data, cond) }));

  await recordPriceChanges(
    client,
    repriced.map((r) => ({
      id: r.id,
      price: r.data.price as number,
      colors: r.data.colors ?? [],
    })),
  );

  const values: unknown[] = [];
  const placeholders = repriced.map((r, i) => {
    const base = i * 2;
    values.push(r.id, JSON.stringify(r.data));
    return `($${base + 1}, $${base + 2}::jsonb)`;
  });
  await client.query(
    `UPDATE products SET data = v.data, updated_at = now()
     FROM (VALUES ${placeholders.join(',')}) AS v(id, data)
     WHERE products.id = v.id AND products.sale_event_id = $${repriced.length * 2 + 1}`,
    [...values, saleEventId],
  );
  return repriced.length;
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
  const {
    id,
    saleId,
    name,
    endDate,
    active,
    buyerCommissionPercent,
    additionalDiscountPercent,
    displayCurrency,
    uahBank,
    uahRate,
  } = body;

  if (endDate !== undefined && endDate !== null && typeof endDate !== 'string') {
    return res.status(400).json({ error: 'endDate має бути рядком дати або null' });
  }

  // A conditions edit always sends the whole block together (see admin-sales.html) — a plain
  // rename/date/pause save from the existing controls never includes these fields, so this flag
  // is how we tell the two apart and only pay for rate-fetching/repricing when actually asked.
  const conditionsProvided =
    buyerCommissionPercent !== undefined ||
    additionalDiscountPercent !== undefined ||
    displayCurrency !== undefined ||
    uahBank !== undefined ||
    uahRate !== undefined;

  try {
    if (id !== undefined) {
      // Update an existing campaign — rename / change end date / pause-resume / edit conditions,
      // independently of any other campaign for the same brand.
      if (typeof id !== 'number') {
        return res.status(400).json({ error: 'id має бути числом' });
      }

      let resolved: (SaleConditions & { uahBank: UahBank | null }) | null = null;
      if (conditionsProvided) {
        const result = await resolveConditions(body);
        if (!result.ok) return res.status(result.status).json({ error: result.error });
        resolved = result.conditions;
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
               display_currency = CASE WHEN $6::boolean THEN $9 ELSE display_currency END,
               uah_bank = CASE WHEN $6::boolean THEN $10 ELSE uah_bank END,
               uah_rate = CASE WHEN $6::boolean THEN $11 ELSE uah_rate END,
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
            resolved?.displayCurrency ?? null,
            resolved?.uahBank ?? null,
            resolved?.uahRate ?? null,
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

    const result = await resolveConditions(body);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const conditions = result.conditions;

    const { rows } = await db.query<{ id: number; name: string }>(
      `INSERT INTO sale_events
         (sale_id, name, end_date, active, buyer_commission_percent, additional_discount_percent, display_currency, uah_bank, uah_rate)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)
       RETURNING id, name`,
      [
        saleId,
        resolvedName,
        endDate ?? null,
        conditions.buyerCommissionPercent,
        conditions.additionalDiscountPercent,
        conditions.displayCurrency,
        conditions.uahBank,
        conditions.uahRate,
      ],
    );
    return res.status(200).json({ ok: true, id: rows[0].id, name: rows[0].name, ...conditions });
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
