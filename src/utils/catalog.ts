import type { CategoryWithImage, ProductsMeta } from '../types';
import { categoryEmoji, categoryLabel } from '../data/categories';
import { sizeKindForCategory, sortSizes, splitTallSizes, type SizeKind, type TallSplit } from './sizes';

export interface AvailableSizes {
  clothing: TallSplit;
  shoes: string[];
  accessories: string[];
}

// Buckets the flat per-category size lists from GET /api/products?meta=1 the same way the old
// client-side getAvailableSizes(products) did — just fed by a small server-computed aggregate
// (one string[] per category) instead of re-deriving it from the full product list on the client.
export function getAvailableSizes(sizesByCategory: Record<string, string[]>, categoryId: string | 'all'): AvailableSizes {
  const byKind: Record<SizeKind, Set<string>> = {
    clothing: new Set(),
    shoes: new Set(),
    accessories: new Set(),
  };
  for (const [catId, sizes] of Object.entries(sizesByCategory)) {
    if (categoryId !== 'all' && catId !== categoryId) continue;
    const kind = sizeKindForCategory(catId);
    sizes.forEach((s) => byKind[kind].add(s));
  }
  return {
    clothing: splitTallSizes([...byKind.clothing]),
    shoes: sortSizes([...byKind.shoes]),
    accessories: sortSizes([...byKind.accessories]),
  };
}

// Same shape/sort as the old client-side getAvailableCategories(products), now fed by
// GET /api/products?meta=1's per-category id+image rows instead of scanning the full catalog.
export function categoriesFromMeta(meta: ProductsMeta): CategoryWithImage[] {
  return meta.categories
    .map((c) => ({ id: c.id, name: categoryLabel(c.id), emoji: categoryEmoji(c.id), image: c.image }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}
