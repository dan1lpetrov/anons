import type {
  CatalogContext,
  CatalogFilters,
  Product,
  ProductColor,
  SortOption,
} from '../types';

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

function matchesColors(product: Product, colorIds: string[]): boolean {
  if (colorIds.length === 0) return true;
  return product.colors.some((c) => colorIds.includes(c.id));
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
      matchesColors(p, filters.colors),
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
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'One Size'];
  const numeric = ['28', '30', '32', '34', '36', '39', '40', '41', '42', '43', '44'];
  const all = new Set<string>();
  products.forEach((p) => p.sizes.forEach((s) => all.add(s)));

  const ordered = [
    ...sizeOrder.filter((s) => all.has(s)),
    ...numeric.filter((s) => all.has(s)),
    ...[...all].filter((s) => !sizeOrder.includes(s) && !numeric.includes(s)).sort(),
  ];
  return ordered;
}

export function getAvailableColors(products: Product[]): ProductColor[] {
  const map = new Map<string, ProductColor>();
  products.forEach((p) => {
    p.colors.forEach((c) => {
      if (!map.has(c.id)) map.set(c.id, c);
    });
  });
  return [...map.values()];
}

export function countActiveFilters(filters: CatalogFilters): number {
  return filters.sizes.length + filters.colors.length;
}
