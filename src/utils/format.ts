export function formatPrice(price: number): string {
  return `${price.toLocaleString('uk-UA')} ₴`;
}

export function discountPercent(price: number, originalPrice?: number): number | null {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}
