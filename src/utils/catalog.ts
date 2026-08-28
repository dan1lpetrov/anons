import type {
  CatalogContext,
  CatalogFilters,
  Category,
  Product,
  SortOption,
} from '../types';
import { categoryEmoji, categoryLabel } from '../data/categories';
import { sizeKindForCategory, sortSizes, splitTallSizes, type SizeKind, type TallSplit } from './sizes';

function matchesContext(product: Product, context: CatalogContext): boolean {
  if (context.mode === 'all') return true;
  if (context.mode === 'category') return product.categoryId === context.categoryId;
  return product.saleId === context.saleId;
}

function matchesSearch(product: Product, search: string): boolean {
  if (!search.trim()) return true;
  const q = search.trim().toLowerCase();
  return (
    product.name.toLowerCase().includes(q) ||
    product.description.toLowerCase().includes(q)
  );
}

function matchesSizes(product: Product, sizes: string[]): boolean {
  if (sizes.length === 0) return true;
  return product.sizes.some((s) => sizes.includes(s));
}

function matchesBrands(product: Product, brands: string[]): boolean {
  if (brands.length === 0) return true;
  return brands.includes(product.saleId);
}

export function filterProducts(
  products: Product[],
  context: CatalogContext,
  filters: CatalogFilters,
): Product[] {
  return products.filter(
    (p) =>
      matchesContext(p, context) &&
      matchesSearch(p, filters.search) &&
      matchesSizes(p, filters.sizes) &&
      matchesBrands(p, filters.brands),
  );
}

export function sortProducts(products: Product[], sort: SortOption): Product[] {
  const sorted = [...products];
  switch (sort) {
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    default:
      // 'recommended': GET /api/products already orders by product_scores.score
      // (falling back to featured_rank), so keep that order as-is.
      return sorted;
  }
}

export function filterAndSortProducts(
  products: Product[],
  context: CatalogContext,
  filters: CatalogFilters,
  sort: SortOption,
): Product[] {
  return sortProducts(filterProducts(products, context, filters), sort);
}

export interface AvailableSizes {
  clothing: TallSplit;
  shoes: string[];
  accessories: string[];
}

export function getAvailableSizes(products: Product[]): AvailableSizes {
  const byKind: Record<SizeKind, Set<string>> = {
    clothing: new Set(),
    shoes: new Set(),
    accessories: new Set(),
  };
  products.forEach((p) => {
    const kind = sizeKindForCategory(p.categoryId);
    p.sizes.forEach((s) => byKind[kind].add(s));
  });
  return {
    clothing: splitTallSizes([...byKind.clothing]),
    shoes: sortSizes([...byKind.shoes]),
    accessories: sortSizes([...byKind.accessories]),
  };
}

export function getAvailableCategories(products: Product[]): Category[] {
  const seen = new Set<string>();
  const list: Category[] = [];
  products.forEach((p) => {
    if (!seen.has(p.categoryId)) {
      seen.add(p.categoryId);
      list.push({ id: p.categoryId, name: categoryLabel(p.categoryId), emoji: categoryEmoji(p.categoryId) });
    }
  });
  return list.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

export function countActiveFilters(filters: CatalogFilters): number {
  return filters.sizes.length + filters.brands.length;
}
