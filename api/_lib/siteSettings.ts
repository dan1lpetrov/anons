import { db } from './db.js';
import { NAMED_BANKS, type NamedBank } from './exchangeRates.js';

// Site-wide display currency — applies to every product on the storefront regardless of which
// sale campaign it's in. Unlike buyer commission / additional discount (still per-campaign, see
// sale_events), currency was per-campaign at first and moved here because a shopper browsing the
// catalog can't sensibly see some products priced in $ and others in ₴ side by side.
export interface SiteCurrency {
  displayCurrency: 'original' | 'uah';
  // null = "власний курс" (custom) — uahRate is always admin-typed for that case. mono/privat
  // always re-fetch a fresh rate at save time instead (see api/sales.ts's resolveSiteCurrency).
  uahBank: NamedBank | null;
  uahRate: number | null;
}

export const DEFAULT_SITE_CURRENCY: SiteCurrency = {
  displayCurrency: 'original',
  uahBank: null,
  uahRate: null,
};

export async function getSiteCurrency(): Promise<SiteCurrency> {
  const { rows } = await db.query<{ display_currency: string; uah_bank: string | null; uah_rate: string | null }>(
    'SELECT display_currency, uah_bank, uah_rate FROM site_settings WHERE id = 1',
  );
  const row = rows[0];
  if (!row) return DEFAULT_SITE_CURRENCY;
  // A row saved before named banks narrowed to just mono/privat (e.g. the old pumb/sens
  // options) falls back to "власний курс" (null) rather than an invalid NamedBank value.
  const uahBank = NAMED_BANKS.includes(row.uah_bank as NamedBank) ? (row.uah_bank as NamedBank) : null;
  return {
    displayCurrency: row.display_currency === 'uah' ? 'uah' : 'original',
    uahBank,
    uahRate: row.uah_rate === null ? null : Number(row.uah_rate),
  };
}

export async function setSiteCurrency(currency: SiteCurrency): Promise<void> {
  await db.query(
    `INSERT INTO site_settings (id, display_currency, uah_bank, uah_rate, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       display_currency = $1, uah_bank = $2, uah_rate = $3, updated_at = now()`,
    [currency.displayCurrency, currency.uahBank, currency.uahRate],
  );
}
