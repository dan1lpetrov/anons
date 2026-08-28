import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';

const EVENT_TYPES = new Set(['view', 'order']);
const MAX_EVENTS_PER_REQUEST = 50;

interface EventInput {
  productId: string;
  eventType: 'view' | 'order';
  telegramUserId: string | null;
}

function parseEvents(body: unknown): EventInput[] {
  const raw = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (e): e is { productId: string; eventType: string; telegramUserId?: unknown } =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as { productId?: unknown }).productId === 'string' &&
        EVENT_TYPES.has((e as { eventType?: unknown }).eventType as string),
    )
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map((e) => ({
      productId: e.productId,
      eventType: e.eventType as 'view' | 'order',
      telegramUserId: typeof e.telegramUserId === 'string' ? e.telegramUserId : null,
    }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const events = parseEvents(req.body);
  if (events.length === 0) {
    return res.status(400).json({ error: 'events має бути непорожнім масивом { productId, eventType }' });
  }

  try {
    const values: unknown[] = [];
    const placeholders = events.map((e, i) => {
      const base = i * 3;
      values.push(e.telegramUserId, e.productId, e.eventType);
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });
    await db.query(
      `INSERT INTO product_events (telegram_user_id, product_id, event_type) VALUES ${placeholders.join(',')}`,
      values,
    );
    return res.status(200).json({ ok: true, count: events.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося записати подію' });
  }
}
