// Fetches a USD→UAH rate for the site-wide display currency setting (api/_lib/siteSettings.ts).
// Only mono/privat have documented, no-auth public JSON APIs — a third "власний курс" (custom)
// option covers any other bank, always as an admin-typed number (see api/sales.ts's
// resolveSiteCurrency: named banks always re-fetch fresh at save time, custom always requires
// a manually entered rate — neither ever falls back to the other's behavior).
export const NAMED_BANKS = ['mono', 'privat'] as const;
export type NamedBank = (typeof NAMED_BANKS)[number];

export async function fetchUsdUahRate(bank: NamedBank): Promise<number> {
  if (bank === 'mono') return fetchMonoRate();
  return fetchPrivatRate();
}

async function fetchMonoRate(): Promise<number> {
  const res = await fetch('https://api.monobank.ua/bank/currency');
  if (!res.ok) throw new Error(`Mono API HTTP ${res.status}`);
  const rates = (await res.json()) as Array<{
    currencyCodeA: number;
    currencyCodeB: number;
    rateSell?: number;
    rateBuy?: number;
    rateCross?: number;
  }>;
  // 840 = USD, 980 = UAH per ISO 4217 numeric codes.
  const usd = rates.find((r) => r.currencyCodeA === 840 && r.currencyCodeB === 980);
  const rate = usd?.rateSell ?? usd?.rateCross ?? usd?.rateBuy;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('Mono: курс USD/UAH недоступний');
  }
  return rate;
}

async function fetchPrivatRate(): Promise<number> {
  // coursid=5 = cashless ("для безготівкових розрахунків") rates.
  const res = await fetch('https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5');
  if (!res.ok) throw new Error(`Privat API HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ ccy: string; sale: string }>;
  const usd = rows.find((r) => r.ccy === 'USD');
  const rate = usd ? parseFloat(usd.sale) : NaN;
  if (!Number.isFinite(rate)) throw new Error('Privat: курс USD недоступний');
  return rate;
}
