import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureSchema } from './_lib/db.js';
import { fetchProductById } from './_lib/productQueries.js';
import { renderShellWithMeta } from './_lib/renderShell.js';

// Handles both /product/:id and /catalog/:categoryId (see vercel.json rewrites)
// in one function on purpose — Vercel's Hobby plan caps a deployment at 12
// Serverless Functions, and this repo was already sitting right at that limit
// before OG previews were added, so the two SSR-shell routes share a file
// instead of getting one function each.

interface ProductData {
  name: string;
  description?: string;
  image?: string;
  colors?: Array<{ thumbnail?: string; images?: string[] }>;
}

// Kept separate from src/data/categories.ts on purpose — api/ and src/ are two
// independent build targets in this repo (see CLAUDE.md), this is the one
// label lookup small enough to just duplicate rather than reach across that
// boundary.
const CATEGORY_LABELS: Record<string, string> = {
  shoes: 'Взуття',
  clothing: 'Одяг',
  accessories: 'Аксесуари',
  tshirts: 'Футболки',
  pants: 'Штани',
  jackets: 'Куртки',
};

function requestUrl(req: VercelRequest, pathname: string): string {
  const host = req.headers.host ?? 'anons.shop';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  return `${proto}://${host}${pathname}`;
}

function firstValue(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : Array.isArray(value) ? (value[0] ?? '') : '';
}

async function renderProduct(req: VercelRequest, res: VercelResponse, id: string) {
  const url = requestUrl(req, `/product/${encodeURIComponent(id)}`);

  let product: ProductData | null = null;
  if (id) {
    try {
      await ensureSchema();
      product = (await fetchProductById(id)) as ProductData | null;
    } catch (error) {
      console.error(error);
    }
  }

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

function renderCatalog(req: VercelRequest, res: VercelResponse, categoryId: string) {
  const label = CATEGORY_LABELS[categoryId] ?? categoryId;
  const url = requestUrl(req, `/catalog/${encodeURIComponent(categoryId)}`);
  return res.status(200).send(
    renderShellWithMeta({
      title: `${label} — розпродажі | Anons`,
      description: `Розпродажі в категорії «${label}» з популярних магазинів на Anons.`,
      url,
    }),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  const id = firstValue(req.query.id);
  if (id) return renderProduct(req, res, id);

  const categoryId = firstValue(req.query.categoryId);
  return renderCatalog(req, res, categoryId);
}
