import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/session.js';
import { verifyTelegramInitData } from './_lib/telegramAuth.js';

const MAX_ITEMS_PER_ORDER = 50;

interface OrderItemInput {
  productId: string | null;
  productName: string;
  productImage: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  size: string;
  colorId: string | null;
  colorName: string | null;
  quantity: number;
  unitPrice: number;
}

function parseItems(raw: unknown): OrderItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items: OrderItemInput[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS_PER_ORDER)) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.productName !== 'string' || !e.productName.trim()) return null;
    if (typeof e.size !== 'string' || !e.size.trim()) return null;
    if (typeof e.quantity !== 'number' || e.quantity <= 0) return null;
    if (typeof e.unitPrice !== 'number' || e.unitPrice < 0) return null;

    items.push({
      productId: typeof e.productId === 'string' ? e.productId : null,
      productName: e.productName,
      productImage: typeof e.productImage === 'string' ? e.productImage : null,
      sourceName: typeof e.sourceName === 'string' ? e.sourceName : null,
      sourceUrl: typeof e.sourceUrl === 'string' ? e.sourceUrl : null,
      size: e.size,
      colorId: typeof e.colorId === 'string' ? e.colorId : null,
      colorName: typeof e.colorName === 'string' ? e.colorName : null,
      quantity: e.quantity,
      unitPrice: e.unitPrice,
    });
  }
  return items;
}

function itemsTotal(items: OrderItemInput[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);

  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

interface OrderListRow {
  id: string;
  createdAt: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramUserId: string | null;
  total: string;
  currency: string | null;
  paid: boolean;
  redeemed: boolean;
  itemCount: string;
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  // Buyer-facing "Мої замовлення" — scoped to one Telegram identity, verified server-side (see
  // _lib/telegramAuth.ts) rather than gated by the admin Google-session check below. Checked
  // first since a buyer is never an admin.
  if (req.query.mine === '1') return handleGetMine(req, res);

  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const idParam = req.query.id;
  if (typeof idParam === 'string' && idParam) return handleGetOne(idParam, res);

  const paidParam = req.query.paid;
  const redeemedParam = req.query.redeemed;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const searchLike = q ? `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%` : null;

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (paidParam === '0' || paidParam === '1') {
    values.push(paidParam === '1');
    conditions.push(`paid = $${values.length}`);
  }
  if (redeemedParam === '0' || redeemedParam === '1') {
    values.push(redeemedParam === '1');
    conditions.push(`redeemed = $${values.length}`);
  }
  if (searchLike) {
    values.push(searchLike);
    const idx = values.length;
    conditions.push(`(id ILIKE $${idx} OR telegram_username ILIKE $${idx} OR telegram_first_name ILIKE $${idx} OR telegram_last_name ILIKE $${idx})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await db.query<OrderListRow>(
      `SELECT o.id, o.created_at AS "createdAt", o.telegram_username AS "telegramUsername",
              o.telegram_first_name AS "telegramFirstName", o.telegram_last_name AS "telegramLastName",
              o.telegram_user_id AS "telegramUserId", o.total, o.currency, o.paid, o.redeemed,
              COUNT(oi.id) AS "itemCount"
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${where}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 200`,
      values,
    );
    return res.status(200).json(
      rows.map((r) => ({
        ...r,
        total: Number(r.total),
        itemCount: Number(r.itemCount),
      })),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити замовлення' });
  }
}

interface OrderRow {
  id: string;
  createdAt: string;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  comment: string | null;
  currency: string | null;
  total: string;
  paid: boolean;
  paidAt: string | null;
  redeemed: boolean;
  redeemedAt: string | null;
}

interface OrderItemRow {
  id: number;
  productId: string | null;
  productName: string;
  productImage: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  size: string;
  colorId: string | null;
  colorName: string | null;
  quantity: number;
  unitPrice: string;
}

async function handleGetMine(req: VercelRequest, res: VercelResponse) {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData !== 'string' || !initData) {
    return res.status(401).json({ error: 'Потрібні дані Telegram' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    // Fail closed, not open: without a bot token there is no way to verify whose orders these
    // are, so this must never fall back to trusting an unverified id.
    console.error('TELEGRAM_BOT_TOKEN не налаштовано — "Мої замовлення" недоступні');
    return res.status(500).json({ error: 'Функція тимчасово недоступна' });
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified.ok) return res.status(401).json({ error: 'Недійсні дані Telegram' });
  const telegramUserId = String(verified.user.id);

  try {
    const { rows: orderRows } = await db.query<Omit<OrderRow, 'telegramUserId' | 'telegramUsername' | 'telegramFirstName' | 'telegramLastName'>>(
      `SELECT id, created_at AS "createdAt", comment, currency, total, paid, paid_at AS "paidAt", redeemed, redeemed_at AS "redeemedAt"
       FROM orders WHERE telegram_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [telegramUserId],
    );
    if (orderRows.length === 0) return res.status(200).json([]);

    const { rows: itemRows } = await db.query<OrderItemRow & { orderId: string }>(
      `SELECT order_id AS "orderId", id, product_id AS "productId", product_name AS "productName", product_image AS "productImage",
              source_name AS "sourceName", source_url AS "sourceUrl", size, color_id AS "colorId",
              color_name AS "colorName", quantity, unit_price AS "unitPrice"
       FROM order_items WHERE order_id = ANY($1::text[]) ORDER BY id ASC`,
      [orderRows.map((o) => o.id)],
    );

    const itemsByOrder = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    return res.status(200).json(
      orderRows.map((o) => ({
        ...o,
        total: Number(o.total),
        items: (itemsByOrder.get(o.id) ?? []).map(({ orderId: _orderId, ...i }) => ({ ...i, unitPrice: Number(i.unitPrice) })),
      })),
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити замовлення' });
  }
}

async function handleGetOne(id: string, res: VercelResponse) {
  try {
    const [{ rows: orderRows }, { rows: itemRows }] = await Promise.all([
      db.query<OrderRow>(
        `SELECT id, created_at AS "createdAt", telegram_user_id AS "telegramUserId",
                telegram_username AS "telegramUsername", telegram_first_name AS "telegramFirstName",
                telegram_last_name AS "telegramLastName", comment, currency, total,
                paid, paid_at AS "paidAt", redeemed, redeemed_at AS "redeemedAt"
         FROM orders WHERE id = $1`,
        [id],
      ),
      db.query<OrderItemRow>(
        `SELECT id, product_id AS "productId", product_name AS "productName", product_image AS "productImage",
                source_name AS "sourceName", source_url AS "sourceUrl", size, color_id AS "colorId",
                color_name AS "colorName", quantity, unit_price AS "unitPrice"
         FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
        [id],
      ),
    ]);

    if (orderRows.length === 0) return res.status(404).json({ error: 'Замовлення не знайдено' });

    return res.status(200).json({
      ...orderRows[0],
      total: Number(orderRows[0].total),
      items: itemRows.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити замовлення' });
  }
}

// Public — called from the storefront at checkout (no admin session, same trust model as
// POST /api/events: telegramUser is whatever initDataUnsafe.user reported, unvalidated).
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return res.status(400).json({ error: 'id обовʼязковий' });

  const items = parseItems(body.items);
  if (!items) return res.status(400).json({ error: 'items має бути непорожнім масивом позицій' });

  const telegramUser = (body.telegramUser ?? {}) as Record<string, unknown>;
  const telegramUserId = telegramUser.id != null ? String(telegramUser.id) : null;
  const telegramUsername = typeof telegramUser.username === 'string' ? telegramUser.username : null;
  const telegramFirstName = typeof telegramUser.first_name === 'string' ? telegramUser.first_name : null;
  const telegramLastName = typeof telegramUser.last_name === 'string' ? telegramUser.last_name : null;
  const comment = typeof body.comment === 'string' ? body.comment : null;
  const currency = typeof body.currency === 'string' ? body.currency : null;
  const total = itemsTotal(items);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // ON CONFLICT DO NOTHING makes a retried keepalive POST (checkout fires this fire-and-forget)
    // idempotent instead of double-inserting items under the same order id.
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO orders (id, telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, comment, currency, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, telegramUserId, telegramUsername, telegramFirstName, telegramLastName, comment, currency, total],
    );

    if (rows.length > 0) {
      const values: unknown[] = [];
      const placeholders = items.map((item, i) => {
        const base = i * 11;
        values.push(
          id,
          item.productId,
          item.productName,
          item.productImage,
          item.sourceName,
          item.sourceUrl,
          item.size,
          item.colorId,
          item.colorName,
          item.quantity,
          item.unitPrice,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
      });
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, source_name, source_url, size, color_id, color_name, quantity, unit_price)
         VALUES ${placeholders.join(',')}`,
        values,
      );
    }

    await client.query('COMMIT');
    return res.status(200).json({ ok: true, id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося зберегти замовлення' });
  } finally {
    client.release();
  }
}

// Admin-only. Two independent update modes, combinable in one request: replacing the item set
// (add/remove/edit a product line — see admin-orders.html) and/or flipping paid/redeemed.
async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return res.status(400).json({ error: 'id обовʼязковий' });

  const paid = typeof body.paid === 'boolean' ? body.paid : null;
  const redeemed = typeof body.redeemed === 'boolean' ? body.redeemed : null;
  const items = body.items !== undefined ? parseItems(body.items) : undefined;
  if (items === null) return res.status(400).json({ error: 'items має бути непорожнім масивом позицій' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE orders SET
         paid = COALESCE($2, paid),
         paid_at = CASE WHEN $2 = true AND paid_at IS NULL THEN now() ELSE paid_at END,
         redeemed = COALESCE($3, redeemed),
         redeemed_at = CASE WHEN $3 = true AND redeemed_at IS NULL THEN now() ELSE redeemed_at END,
         updated_at = now()
       WHERE id = $1`,
      [id, paid, redeemed],
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Замовлення не знайдено' });
    }

    if (items) {
      await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
      const values: unknown[] = [];
      const placeholders = items.map((item, i) => {
        const base = i * 11;
        values.push(
          id,
          item.productId,
          item.productName,
          item.productImage,
          item.sourceName,
          item.sourceUrl,
          item.size,
          item.colorId,
          item.colorName,
          item.quantity,
          item.unitPrice,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
      });
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_image, source_name, source_url, size, color_id, color_name, quantity, unit_price)
         VALUES ${placeholders.join(',')}`,
        values,
      );
      await client.query(`UPDATE orders SET total = $2, updated_at = now() WHERE id = $1`, [id, itemsTotal(items)]);
    }

    await client.query('COMMIT');
    return res.status(200).json({ ok: true, id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося оновити замовлення' });
  } finally {
    client.release();
  }
}
