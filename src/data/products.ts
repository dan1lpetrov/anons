import type { Product, SaleId } from '../types';
import { sales } from './sales';

type ProductSeed = Omit<Product, 'sourceName' | 'sourceUrl'>;

const saleSources: Record<SaleId, Pick<Product, 'sourceName' | 'sourceUrl'>> = Object.fromEntries(
  sales.map(({ id, name, url }) => [id, { sourceName: name, sourceUrl: url }]),
) as Record<SaleId, Pick<Product, 'sourceName' | 'sourceUrl'>>;

const productSeeds: ProductSeed[] = [];

export const products: Product[] = productSeeds.map((product) => ({
  ...product,
  ...saleSources[product.saleId],
}));

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function countProductsBySale(saleId: string): number {
  return products.filter((p) => p.saleId === saleId).length;
}

export function countProductsByCategory(categoryId: string): number {
  return products.filter((p) => p.categoryId === categoryId).length;
}
