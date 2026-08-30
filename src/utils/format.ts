import type { Product, ProductColor } from '../types';

// Products carry their own `currency` (set server-side from the site-wide display currency —
// see api/_lib/pricing.ts's repriceProductData) so the symbol always matches the actual unit
// `price` is in, even mid-way through a currency-switch repricing sweep. Falls back to USD for
// products uploaded before this field existed.
export function formatPrice(price: number, currency: 'USD' | 'UAH' = 'USD'): string {
  if (currency === 'UAH') return `${Math.round(price).toLocaleString('uk-UA')} ₴`;
  return `$${price.toLocaleString('en-US')}`;
}

export function discountPercent(price: number, originalPrice?: number): number | null {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function colorPrice(product: Product, color?: ProductColor): number {
  return color?.price ?? product.price;
}

export function colorOriginalPrice(product: Product, color?: ProductColor): number | undefined {
  return color?.originalPrice ?? product.originalPrice;
}

export function pluralizeUk(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return forms[1];
  return forms[2];
}
