const LETTER_ORDER: Record<string, number> = {
  XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, '2XL': 6, '3XL': 7, '4XL': 8, '5XL': 9,
};

function sizeRank(size: string): [number, number, string] {
  const s = size.trim();
  const upper = s.toUpperCase();
  if (upper in LETTER_ORDER) return [0, LETTER_ORDER[upper] * 2, s];
  const tallMatch = /^(.+)T$/.exec(upper);
  if (tallMatch && tallMatch[1] in LETTER_ORDER) {
    return [0, LETTER_ORDER[tallMatch[1]] * 2 + 1, s];
  }
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
