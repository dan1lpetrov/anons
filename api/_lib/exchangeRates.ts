// Fetches a USD→UAH rate at sale-campaign creation time, used to convert reseller pricing to
// UAH for display (see sale conditions on `sale_events`). Only mono/privat have documented,
// no-auth public JSON APIs — pumb/sens don't, so those two require the admin to type the rate
// in by hand (see api/sales.ts's handlePost).
export type AutoRateBank = 'mono' | 'privat';

export async function fetchUsdUahRate(bank: AutoRateBank): Promise<number> {
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
