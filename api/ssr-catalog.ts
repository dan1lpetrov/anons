import type { VercelRequest, VercelResponse } from '@vercel/node';
import { renderShellWithMeta } from './_lib/renderShell.js';

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

export default function handler(req: VercelRequest, res: VercelResponse) {
  const rawCategoryId = req.query.categoryId;
  const categoryId = typeof rawCategoryId === 'string' ? rawCategoryId : Array.isArray(rawCategoryId) ? rawCategoryId[0] : '';
  const label = CATEGORY_LABELS[categoryId] ?? categoryId;
  const url = requestUrl(req, `/catalog/${encodeURIComponent(categoryId)}`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.status(200).send(
    renderShellWithMeta({
      title: `${label} — розпродажі | Anons`,
      description: `Розпродажі в категорії «${label}» з популярних магазинів на Anons.`,
      url,
    }),
  );
}
