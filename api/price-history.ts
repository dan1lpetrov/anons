import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { getSiteCurrency } from './_lib/siteSettings.js';

interface PricePoint {
  price: number;
  recordedAt: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const productId = req.query.productId;
  const colorId = req.query.colorId;
  if (typeof productId !== 'string' || typeof colorId !== 'string') {
    return res.status(400).json({ error: 'productId і colorId є обовʼязковими рядковими параметрами' });
  }

  try {
    const { rows } = await db.query<{ price: string; recorded_at: string }>(
      `SELECT price, recorded_at FROM price_history
       WHERE product_id = $1 AND color_id = $2
       ORDER BY recorded_at ASC`,
      [productId, colorId],
    );

    const { rows: productRows } = await db.query<{ data: { price: number; colors: Array<{ id: string; price?: number; originalPrice?: number }> } }>(
      `SELECT data FROM products WHERE id = $1`,
      [productId],
    );
    const product = productRows[0]?.data;
    const color = product?.colors.find((c) => c.id === colorId);
    const price = color?.price ?? product?.price;
    const originalPrice = color?.originalPrice;

    // price_history stores the pre-FX price (see CLAUDE.md) so a currency/rate change never
    // logs as a fake price change — convert to the site's current display currency here, the
    // same way repriceProductData does, so the chart's numbers match what's shown everywhere
    // else instead of showing the raw base-currency figure under a mismatched ₴/$ label.
    const siteCurrency = await getSiteCurrency();
    const toDisplay = (n: number) =>
      siteCurrency.displayCurrency === 'uah' && siteCurrency.uahRate ? Math.round(n * siteCurrency.uahRate * 100) / 100 : n;

    const points: PricePoint[] = rows.map((r) => ({ price: toDisplay(Number(r.price)), recordedAt: r.recorded_at }));

    // With fewer than two real recorded points there's no trend to draw yet —
    // anchor the chart with a synthetic "started at full price" -> current-
    // price pair so it still shows something for a freshly discounted
    // product. Once two or more real price-change rows exist, skip this
    // entirely: keeping the (usually much higher) original price in the
    // chart's y-scale forever would dwarf real fluctuations and make them
    // unreadable, and it's already shown as a strikethrough right above the
    // chart anyway.
    if (points.length < 2) {
      if (points.length === 0 && typeof price === 'number' && typeof originalPrice === 'number' && originalPrice !== price) {
        points.push({ price, recordedAt: new Date().toISOString() });
      }
      if (typeof originalPrice === 'number' && points[0]?.price !== originalPrice) {
        points.unshift({ price: originalPrice, recordedAt: null });
      }
    }

    return res.status(200).json({ points });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити історію цін' });
  }
}
