import type { VercelPoolClient } from '@vercel/postgres';

export interface ProductColorData {
  id?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  basePrice?: unknown;
  baseOriginalPrice?: unknown;
}
export interface ProductData {
  price?: unknown;
  originalPrice?: unknown;
  basePrice?: unknown;
  baseOriginalPrice?: unknown;
  colors?: ProductColorData[];
}

export function effectivePrice(product: ProductData, color: ProductColorData): number | undefined {
  return typeof color.price === 'number' ? color.price : typeof product.price === 'number' ? product.price : undefined;
}

export function effectiveOriginalPrice(product: ProductData, color: ProductColorData): number | undefined {
  if (typeof color.originalPrice === 'number') return color.originalPrice;
  if (typeof product.originalPrice === 'number') return product.originalPrice;
  return undefined;
}

export interface PriceHistoryInput {
  id: string;
  price: number;
  colors: Array<{ id?: unknown; price?: unknown }>;
}

// Shared by api/products.ts's upload path and api/sales.ts's campaign-conditions edit path
// (repriceCampaignProducts) — both change stored prices and need the same price_history
// bookkeeping so the ranking cron's price-vs-history signal sees every change.
export async function recordPriceChanges(client: VercelPoolClient, products: PriceHistoryInput[]) {
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

export interface SaleConditions {
  buyerCommissionPercent: number;
  additionalDiscountPercent: number;
  displayCurrency: string;
  uahRate: number | null;
}

// price × (1 − discount%) × (1 + commission%), then × rate if displaying in UAH. Mirrors
// applySaleConditions() in public/admin-upload.html — kept in sync by hand, since one is
// browser JS run at upload time and the other is this server-side repricing pass (see
// repriceProductData below), run when an admin edits an existing campaign's conditions.
function applySaleMarkup(basePrice: number | undefined, cond: SaleConditions): number | undefined {
  if (typeof basePrice !== 'number') return undefined;
  let p = basePrice * (1 - cond.additionalDiscountPercent / 100);
  p = p * (1 + cond.buyerCommissionPercent / 100);
  if (cond.displayCurrency === 'uah' && cond.uahRate) p = p * cond.uahRate;
  return Math.round(p * 100) / 100;
}

// Re-derives price/originalPrice (top-level and per-color) from basePrice/baseOriginalPrice
// under a (possibly just-changed) set of sale conditions. Always reads from base*, never from
// the current price/originalPrice, so repeated edits don't compound markup on top of markup.
// Products uploaded before basePrice existed have none — for those price/originalPrice IS the
// base (no markup was ever applied), so falling back to it is correct, not just a safe default.
export function repriceProductData<T extends ProductData>(data: T, cond: SaleConditions): T {
  const basePrice = typeof data.basePrice === 'number' ? data.basePrice : (data.price as number | undefined);
  const baseOriginalPrice =
    typeof data.baseOriginalPrice === 'number' ? data.baseOriginalPrice : (data.originalPrice as number | undefined);
  return {
    ...data,
    basePrice,
    baseOriginalPrice,
    price: applySaleMarkup(basePrice, cond),
    originalPrice: applySaleMarkup(baseOriginalPrice, cond),
    colors: (data.colors ?? []).map((c) => {
      const cBasePrice = typeof c.basePrice === 'number' ? c.basePrice : (c.price as number | undefined);
      const cBaseOriginalPrice =
        typeof c.baseOriginalPrice === 'number' ? c.baseOriginalPrice : (c.originalPrice as number | undefined);
      return {
        ...c,
        ...(cBasePrice !== undefined ? { basePrice: cBasePrice, price: applySaleMarkup(cBasePrice, cond) } : {}),
        ...(cBaseOriginalPrice !== undefined
          ? { baseOriginalPrice: cBaseOriginalPrice, originalPrice: applySaleMarkup(cBaseOriginalPrice, cond) }
          : {}),
      };
    }),
  };
}

// Best (highest) discount % across a product's colors, 0 if none are discounted.
export function bestDiscount(data: ProductData): number {
  const colors = Array.isArray(data.colors) && data.colors.length > 0 ? data.colors : [{}];
  let best = 0;
  for (const color of colors) {
    const price = effectivePrice(data, color);
    const originalPrice = effectiveOriginalPrice(data, color);
    if (typeof price === 'number' && typeof originalPrice === 'number' && originalPrice > price) {
      best = Math.max(best, (originalPrice - price) / originalPrice);
    }
  }
  return best;
}
