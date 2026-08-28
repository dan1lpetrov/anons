import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ScoreWeights } from './_lib/weights.js';
import { ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';
import { DEFAULT_WEIGHTS, getWeights, setWeights } from './_lib/weights.js';

const WEIGHT_KEYS: (keyof ScoreWeights)[] = ['discount', 'priceVsHistory', 'views', 'orders', 'trending'];

function isValidWeights(body: unknown): body is ScoreWeights {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return WEIGHT_KEYS.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]) && (record[key] as number) >= 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401

  try {
    if (req.method === 'GET') {
      const weights = await getWeights();
      return res.status(200).json({ weights, defaults: DEFAULT_WEIGHTS });
    }

    if (!isValidWeights(req.body)) {
      return res.status(400).json({
        error: 'Потрібні невідʼємні числа: discount, priceVsHistory, views, orders, trending',
      });
    }
    await setWeights(req.body);
    return res.status(200).json({ ok: true, weights: req.body });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося обробити ваги ранжування' });
  }
}
