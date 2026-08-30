import { db } from './db.js';
import type { UahBank } from './exchangeRates.js';

// Site-wide display currency — applies to every product on the storefront regardless of which
// sale campaign it's in. Unlike buyer commission / additional discount (still per-campaign, see
// sale_events), currency was per-campaign at first and moved here because a shopper browsing the
// catalog can't sensibly see some products priced in $ and others in ₴ side by side.
export interface SiteCurrency {
  displayCurrency: 'original' | 'uah';
  uahBank: UahBank | null;
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
  return {
    displayCurrency: row.display_currency === 'uah' ? 'uah' : 'original',
    uahBank: (row.uah_bank as UahBank | null) ?? null,
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
