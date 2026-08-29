import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, ensureSchema } from './_lib/db.js';
import { bestDiscount, type ProductData } from './_lib/pricing.js';
import { requireAdmin } from './_lib/session.js';

const EVENT_TYPES = new Set(['view', 'order']);
const MAX_EVENTS_PER_REQUEST = 50;

interface EventInput {
  productId: string;
  eventType: 'view' | 'order';
  telegramUserId: string | null;
  orderId: string | null;
  quantity: number | null;
  unitPrice: number | null;
}

function parseEvents(body: unknown): EventInput[] {
  const raw = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (e): e is { productId: string; eventType: string; telegramUserId?: unknown; orderId?: unknown; quantity?: unknown; unitPrice?: unknown } =>
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
      orderId: typeof e.orderId === 'string' ? e.orderId : null,
      quantity: typeof e.quantity === 'number' && e.quantity > 0 ? e.quantity : null,
      unitPrice: typeof e.unitPrice === 'number' && e.unitPrice >= 0 ? e.unitPrice : null,
    }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureSchema();

  if (req.method === 'GET') return handleGetDashboard(req, res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const events = parseEvents(req.body);
  if (events.length === 0) {
    return res.status(400).json({ error: 'events має бути непорожнім масивом { productId, eventType }' });
  }

  try {
    const values: unknown[] = [];
    const placeholders = events.map((e, i) => {
      const base = i * 6;
      values.push(e.telegramUserId, e.productId, e.eventType, e.orderId, e.quantity, e.unitPrice);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });
    await db.query(
      `INSERT INTO product_events (telegram_user_id, product_id, event_type, order_id, quantity, unit_price) VALUES ${placeholders.join(',')}`,
      values,
    );
    return res.status(200).json({ ok: true, count: events.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося записати подію' });
  }
}

const ALLOWED_RANGE_DAYS = new Set([7, 30, 90]);
const HEATMAP_MIN_DAYS = 28; // ~4 full weeks, so every weekday has a comparable number of samples
const TOP_PRODUCTS_LIMIT = 8;
const SALES_ENDING_LIMIT = 5;

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0; // "null" -> UI shows "new", not a bogus +∞%
  return ((current - previous) / previous) * 100;
}

async function handleGetDashboard(req: VercelRequest, res: VercelResponse) {
  if (req.query.dashboard !== '1') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = await requireAdmin(req, res);
  if (!email) return; // requireAdmin already sent the 401 response

  const daysParam = Number(req.query.days);
  const days = ALLOWED_RANGE_DAYS.has(daysParam) ? daysParam : 30;
  const heatmapDays = Math.max(days, HEATMAP_MIN_DAYS);

  try {
    const [kpi, series, heatmap, salesEnding, brands, topProducts] = await Promise.all([
      loadKpi(days),
      loadDailySeries(days),
      loadHeatmap(heatmapDays),
      loadSalesEnding(),
      loadBrandBreakdown(),
      loadTopProducts(days),
    ]);

    return res.status(200).json({ range: { days }, kpi, series, heatmap, salesEnding, brands, topProducts });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не вдалося завантажити дані дашборду' });
  }
}

interface KpiRow {
  orders_count: string;
  orders_count_prev: string;
  revenue: string;
  revenue_prev: string;
  views_count: string;
  views_count_prev: string;
}

async function loadKpi(days: number) {
  const { rows } = await db.query<KpiRow>(
    `SELECT
       COUNT(DISTINCT order_id) FILTER (WHERE event_type = 'order' AND created_at >= now() - ($1 || ' days')::interval) AS orders_count,
       COUNT(DISTINCT order_id) FILTER (WHERE event_type = 'order' AND created_at >= now() - ($2 || ' days')::interval AND created_at < now() - ($1 || ' days')::interval) AS orders_count_prev,
       COALESCE(SUM(quantity * unit_price) FILTER (WHERE event_type = 'order' AND created_at >= now() - ($1 || ' days')::interval AND unit_price IS NOT NULL), 0) AS revenue,
       COALESCE(SUM(quantity * unit_price) FILTER (WHERE event_type = 'order' AND created_at >= now() - ($2 || ' days')::interval AND created_at < now() - ($1 || ' days')::interval AND unit_price IS NOT NULL), 0) AS revenue_prev,
       COUNT(*) FILTER (WHERE event_type = 'view' AND created_at >= now() - ($1 || ' days')::interval) AS views_count,
       COUNT(*) FILTER (WHERE event_type = 'view' AND created_at >= now() - ($2 || ' days')::interval AND created_at < now() - ($1 || ' days')::interval) AS views_count_prev
     FROM product_events
     WHERE created_at >= now() - ($2 || ' days')::interval`,
    [days, days * 2],
  );
  return summarizeKpi(rows[0]);
}

function summarizeKpi(row: KpiRow | undefined) {
  const orders = Number(row?.orders_count ?? 0);
  const ordersPrev = Number(row?.orders_count_prev ?? 0);
  const revenue = Number(row?.revenue ?? 0);
  const revenuePrev = Number(row?.revenue_prev ?? 0);
  const views = Number(row?.views_count ?? 0);
  const viewsPrev = Number(row?.views_count_prev ?? 0);
  const conversion = views > 0 ? (orders / views) * 100 : 0;
  const conversionPrev = viewsPrev > 0 ? (ordersPrev / viewsPrev) * 100 : 0;

  return {
    orders: { value: orders, deltaPct: pct(orders, ordersPrev) },
    revenue: { value: revenue, deltaPct: pct(revenue, revenuePrev) },
    views: { value: views, deltaPct: pct(views, viewsPrev) },
    conversion: { value: conversion, deltaPts: conversion - conversionPrev },
  };
}

interface DailyRow {
  day: string;
  orders: string;
  views: string;
  revenue: string;
}

async function loadDailySeries(days: number) {
  const { rows } = await db.query<DailyRow>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
       COUNT(DISTINCT order_id) FILTER (WHERE event_type = 'order') AS orders,
       COUNT(*) FILTER (WHERE event_type = 'view') AS views,
       COALESCE(SUM(quantity * unit_price) FILTER (WHERE event_type = 'order' AND unit_price IS NOT NULL), 0) AS revenue
     FROM product_events
     WHERE created_at >= now() - ($1 || ' days')::interval
     GROUP BY 1
     ORDER BY 1`,
    [days],
  );

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const orders: number[] = [];
  const views: number[] = [];
  const revenue: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    orders.push(row ? Number(row.orders) : 0);
    views.push(row ? Number(row.views) : 0);
    revenue.push(row ? Number(row.revenue) : 0);
  }
  return { orders, views, revenue };
}

interface HeatmapRow {
  dow: number;
  bucket: number;
  cnt: string;
}

// dow: 0=Sunday..6=Saturday (Postgres default) remapped to 0=Monday..6=Sunday for the UI grid.
function toMondayFirst(pgDow: number): number {
  return (pgDow + 6) % 7;
}

async function loadHeatmap(days: number) {
  const { rows } = await db.query<HeatmapRow>(
    `SELECT EXTRACT(DOW FROM created_at)::int AS dow,
       FLOOR(EXTRACT(HOUR FROM created_at) / 4)::int AS bucket,
       COUNT(*) AS cnt
     FROM product_events
     WHERE created_at >= now() - ($1 || ' days')::interval
     GROUP BY 1, 2`,
    [days],
  );

  const grid: number[][] = Array.from({ length: 6 }, () => Array(7).fill(0));
  let max = 0;
  for (const r of rows) {
    const day = toMondayFirst(r.dow);
    const bucket = Math.min(5, Math.max(0, r.bucket));
    const count = Number(r.cnt);
    grid[bucket][day] += count;
    max = Math.max(max, grid[bucket][day]);
  }
  return { cells: grid, max };
}

interface SaleWindowRow {
  sale_id: string;
  end_date: string | null;
}

async function loadSalesEnding() {
  const { rows } = await db.query<SaleWindowRow>(
    `SELECT sale_id, end_date FROM sale_windows WHERE active = true ORDER BY end_date ASC NULLS LAST LIMIT $1`,
    [SALES_ENDING_LIMIT],
  );
  const now = Date.now();
  return rows.map((r) => ({
    saleId: r.sale_id,
    endDate: r.end_date,
    daysLeft: r.end_date ? Math.ceil((new Date(r.end_date).getTime() - now) / 86_400_000) : null,
  }));
}

async function loadBrandBreakdown() {
  const { rows } = await db.query<{ sale_id: string; cnt: string }>(
    `SELECT sale_id, COUNT(*) AS cnt FROM products GROUP BY sale_id ORDER BY cnt DESC`,
  );
  return rows.map((r) => ({ saleId: r.sale_id, count: Number(r.cnt) }));
}

interface TopProductRow {
  id: string;
  data: ProductData & { name?: unknown };
  sale_id: string;
  score: string | null;
  views: string;
  orders: string;
}

async function loadTopProducts(days: number) {
  const { rows } = await db.query<TopProductRow>(
    `SELECT p.id, p.data, p.sale_id, s.score,
       COUNT(*) FILTER (WHERE e.event_type = 'view') AS views,
       COUNT(*) FILTER (WHERE e.event_type = 'order') AS orders
     FROM products p
     LEFT JOIN product_scores s ON s.product_id = p.id
     LEFT JOIN product_events e ON e.product_id = p.id AND e.created_at >= now() - ($2 || ' days')::interval
     GROUP BY p.id, p.data, p.sale_id, s.score
     ORDER BY s.score DESC NULLS LAST
     LIMIT $1`,
    [TOP_PRODUCTS_LIMIT, days],
  );

  return rows.map((r) => ({
    id: r.id,
    name: typeof r.data.name === 'string' ? r.data.name : r.id,
    saleId: r.sale_id,
    discountPct: Math.round(bestDiscount(r.data) * 100),
    views: Number(r.views),
    orders: Number(r.orders),
    score: r.score !== null ? Number(r.score) : null,
  }));
}
