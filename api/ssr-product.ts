import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { renderShellWithMeta } from './_lib/renderShell.js';

interface ProductData {
  name: string;
  description?: string;
  image?: string;
  colors?: Array<{ thumbnail?: string; images?: string[] }>;
}

function requestUrl(req: VercelRequest, pathname: string): string {
  const host = req.headers.host ?? 'anons.shop';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  return `${proto}://${host}${pathname}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawId = req.query.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
  const url = requestUrl(req, `/product/${encodeURIComponent(id)}`);

  let product: ProductData | null = null;
  if (id) {
    try {
      await ensureSchema();
      const { rows } = await db.query<{ data: ProductData }>(
        `SELECT p.data
         FROM products p
         LEFT JOIN sale_windows w ON w.sale_id = p.sale_id
         WHERE p.id = $1 AND (w.active IS NOT FALSE) AND (w.end_date IS NULL OR w.end_date > now())
         LIMIT 1`,
        [id],
      );
      product = rows[0]?.data ?? null;
    } catch (error) {
      console.error(error);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  if (!product) {
    // Not found / removed sale — serve the plain shell; the client-side route
    // already redirects home when it can't find the product either.
    return res.status(200).send(renderShellWithMeta({ title: 'Anons — розпродажі одягу', url }));
  }

  const image = product.image ?? product.colors?.[0]?.thumbnail ?? product.colors?.[0]?.images?.[0];
  return res.status(200).send(
    renderShellWithMeta({
      title: `${product.name} — Anons`,
      description: product.description,
      image,
      url,
      type: 'product',
    }),
  );
}
