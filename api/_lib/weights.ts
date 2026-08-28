import { db } from './db.js';

export interface ScoreWeights {
  discount: number;
  priceVsHistory: number;
  views: number;
  orders: number;
  trending: number;
}

// Same values the composite score used before weights became editable — kept as the fallback
// whenever nobody has saved a row in score_weights yet.
export const DEFAULT_WEIGHTS: ScoreWeights = {
  discount: 0.25,
  priceVsHistory: 0.25,
  views: 0.15,
  orders: 0.25,
  trending: 0.1,
};

export async function getWeights(): Promise<ScoreWeights> {
  const { rows } = await db.query<{
    discount: string;
    price_vs_history: string;
    views: string;
    orders: string;
    trending: string;
  }>('SELECT discount, price_vs_history, views, orders, trending FROM score_weights WHERE id = 1');

  const row = rows[0];
  if (!row) return DEFAULT_WEIGHTS;
  return {
    discount: Number(row.discount),
    priceVsHistory: Number(row.price_vs_history),
    views: Number(row.views),
    orders: Number(row.orders),
    trending: Number(row.trending),
  };
}

export async function setWeights(weights: ScoreWeights): Promise<void> {
  await db.query(
    `INSERT INTO score_weights (id, discount, price_vs_history, views, orders, trending, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       discount = $1, price_vs_history = $2, views = $3, orders = $4, trending = $5, updated_at = now()`,
    [weights.discount, weights.priceVsHistory, weights.views, weights.orders, weights.trending],
  );
}
