import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';

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

    if (rows.length >= 2) {
      const points: PricePoint[] = rows.map((r) => ({ price: Number(r.price), recordedAt: r.recorded_at }));
      return res.status(200).json({ points });
    }

    const { rows: productRows } = await db.query<{ data: { price: number; colors: Array<{ id: string; price?: number; originalPrice?: number }> } }>(
      `SELECT data FROM products WHERE id = $1`,
      [productId],
    );
    const product = productRows[0]?.data;
    const color = product?.colors.find((c) => c.id === colorId);
    const price = color?.price ?? product?.price;
    const originalPrice = color?.originalPrice;

    if (typeof price !== 'number' || typeof originalPrice !== 'number' || originalPrice === price) {
      return res.status(200).json({ points: [] });
    }

    const points: PricePoint[] = [
      { price: originalPrice, recordedAt: null },
      { price, recordedAt: rows[0]?.recorded_at ?? new Date().toISOString() },
    ];
    return res.status(200).json({ points });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити історію цін' });
  }
}
