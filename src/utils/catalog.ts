import type {
  CatalogContext,
  CatalogFilters,
  Product,
  SortOption,
} from '../types';
import { sortSizes } from './sizes';

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
      return sorted.sort((a, b) => a.featuredRank - b.featuredRank);
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

export function getAvailableSizes(products: Product[]): string[] {
  const all = new Set<string>();
  products.forEach((p) => p.sizes.forEach((s) => all.add(s)));
  return sortSizes([...all]);
}

export function countActiveFilters(filters: CatalogFilters): number {
  return filters.sizes.length + filters.brands.length;
}
