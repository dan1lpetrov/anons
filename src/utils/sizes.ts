export type SizeKind = 'clothing' | 'shoes' | 'accessories';

const FOOTWEAR_CATEGORIES = new Set(['shoes', 'footwear', 'sneakers']);
const ACCESSORY_CATEGORIES = new Set(['accessories']);

export function sizeKindForCategory(categoryId: string): SizeKind {
  const c = categoryId.trim().toLowerCase();
  if (FOOTWEAR_CATEGORIES.has(c)) return 'shoes';
  if (ACCESSORY_CATEGORIES.has(c)) return 'accessories';
  return 'clothing';
}

const LETTER_ORDER: Record<string, number> = {
  XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, '2XL': 6, '3XL': 7, '4XL': 8, '5XL': 9,
};

function tallBase(upper: string): string | null {
  const m = /^(.+)T$/.exec(upper);
  return m && m[1] in LETTER_ORDER ? m[1] : null;
}

export function isTallSize(size: string): boolean {
  return tallBase(size.trim().toUpperCase()) !== null;
}

function sizeRank(size: string): [number, number, string] {
  const s = size.trim();
  const upper = s.toUpperCase();
  if (upper in LETTER_ORDER) return [0, LETTER_ORDER[upper] * 2, s];
  const base = tallBase(upper);
  if (base) return [0, LETTER_ORDER[base] * 2 + 1, s];
  const mw = /^M\s*([\d.]+)\s*\/\s*W\s*([\d.]+)$/i.exec(s);
  if (mw) return [1, parseFloat(mw[1]), s];
  if (/^[\d.]+$/.test(s)) return [1, parseFloat(s), s];
  if (upper === 'OSFA' || upper === 'ONE SIZE') return [2, 0, s];
  return [3, 0, s];
}

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ra = sizeRank(a);
    const rb = sizeRank(b);
    if (ra[0] !== rb[0]) return ra[0] - rb[0];
    if (ra[1] !== rb[1]) return ra[1] - rb[1];
    return ra[2].localeCompare(rb[2]);
  });
}

export interface TallSplit {
  regular: string[];
  tall: string[];
}

/** Sorts and separates plain sizes from their Tall (T) variants, e.g. L/XL vs LT/XLT. */
export function splitTallSizes(sizes: string[]): TallSplit {
  const regular: string[] = [];
  const tall: string[] = [];
  sortSizes(sizes).forEach((s) => (isTallSize(s) ? tall : regular).push(s));
  return { regular, tall };
}
