export interface ProductColorData {
  id?: unknown;
  price?: unknown;
  originalPrice?: unknown;
}
export interface ProductData {
  price?: unknown;
  originalPrice?: unknown;
  colors?: ProductColorData[];
}

export function effectivePrice(product: ProductData, color: ProductColorData): number | undefined {
  return typeof color.price === 'number' ? color.price : typeof product.price === 'number' ? product.price : undefined;
}

export function effectiveOriginalPrice(product: ProductData, color: ProductColorData): number | undefined {
  if (typeof color.originalPrice === 'number') return color.originalPrice;
  if (typeof product.originalPrice === 'number') return product.originalPrice;
  return undefined;
}

// Best (highest) discount % across a product's colors, 0 if none are discounted.
export function bestDiscount(data: ProductData): number {
  const colors = Array.isArray(data.colors) && data.colors.length > 0 ? data.colors : [{}];
  let best = 0;
  for (const color of colors) {
    const price = effectivePrice(data, color);
    const originalPrice = effectiveOriginalPrice(data, color);
    if (typeof price === 'number' && typeof originalPrice === 'number' && originalPrice > price) {
      best = Math.max(best, (originalPrice - price) / originalPrice);
    }
  }
  return best;
}
